# FIT File Integration Guide

This document outlines the data flow and integration points for processing FIT files between the mobile client and the tRPC backend.

---

## 1. High-Level Architectural Diagram

The following diagram illustrates the new architecture for handling FIT file uploads and processing:

```
+-------------------------------------------------------------------------------------------------+
|                                                                                                 |
|   Mobile Client                                           +---------------------------------+   |
|                                                           |                                 |   |
|   +-----------+     +-----------+     +-----------+       |   tRPC Backend                  |   |
|   |           |     |           |     |           |       |                                 |   |
|   |  Record   |---->|  Encode   |---->|  Upload   |------>|  Download + Parse + Calculate   |   |
|   |   (FIT)   |     |  (Base64) |     | (to S3)   |       |       +      Store              |   |
|   |           |     |           |     |           |       |                                 |   |
|   +-----------+     +-----------+     +-----------+       |                                 |   |
|         ^                                                 |                                 |   |
|         |                                                 +---------------------------------+   |
|         |                                                               |                     |
|         |                                                               |                     |
|         +---------------------------------------------------------------+                     |
|                                    (Success/Error)                                            |
|                                                                                                 |
+-------------------------------------------------------------------------------------------------+
```

---

## 2. tRPC Endpoint Definitions

### Get Signed URL Mutation

This mutation is called by the client to get a secure, pre-signed URL for uploading the FIT file directly to an S3 bucket.

- **Mutation:** `fitFiles.getSignedUrl`
- **Input:**

  ```typescript
  import { z } from "zod";

  export const GetSignedUrlInput = z.object({
    fileType: z.string().min(1), // e.g., 'application/fit'
    fileName: z.string().min(1), // e.g., '2023-10-27-ride.fit'
  });
  ```

- **Output (Success):**
  ```typescript
  {
    signedUrl: string; // The pre-signed URL for the S3 upload
    fileKey: string; // The unique key for the file in S3
  }
  ```

### Process FIT File Mutation

This is the primary mutation that the client calls _after_ successfully uploading the FIT file to S3. It triggers the server-side processing pipeline.

- **Mutation:** `fitFiles.processFitFile`
- **Input:**

  ```typescript
  import { z } from "zod";

  export const ProcessFitFileInput = z.object({
    fileKey: z.string().min(1), // The unique key for the file in S3 (from getSignedUrl)
    activityName: z.string().min(1),
    activityDescription: z.string().optional(),
  });
  ```

- **Output (Success):**
  ```typescript
  {
    activityId: string; // The ID of the newly created activity record
    message: string; // e.g., 'FIT file processed successfully'
  }
  ```

---

## 3. Error Handling Strategy

| Scenario                       | Handling                                                                                                                                                                                                                                              | User Notification                                                                                         |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Get Signed URL Fails**       | The `fitFiles.getSignedUrl` mutation returns a tRPC error. The client should not attempt to upload the file.                                                                                                                                          | Show a generic "Upload failed, please try again" message. Log the error.                                  |
| **FIT File Upload Fails**      | The client's HTTP PUT request to the pre-signed S3 URL fails (e.g., network error). The client should retry the upload a few times with exponential backoff.                                                                                          | Display an "Upload in progress..." message with a retry mechanism. If retries fail, show "Upload failed." |
| **Server-Side Download Fails** | The server fails to download the FIT file from S3. The `fitFiles.processFitFile` mutation returns a tRPC error.                                                                                                                                       | The user is notified that processing failed and should try re-uploading the activity.                     |
| **Server-Side Parsing Fails**  | The server successfully downloads the file, but the FIT parsing library throws an error (e.g., corrupt file). The `fitFiles.processFitFile` mutation returns a tRPC error. The uploaded FIT file may be moved to a "quarantine" bucket for debugging. | The user receives a "Could not process FIT file. It may be corrupt." message.                             |
| **Metric Calculation Fails**   | The file is parsed, but there's an issue with calculating the metrics. This is an internal server error. The `fitFiles.processFitFile` mutation returns a tRPC error.                                                                                 | A generic "Processing failed" message is shown. The server should have detailed logging for this.         |
| **Database Store Fails**       | The server calculates metrics but fails to write them to the `activities` table. The entire transaction is rolled back. The `fitFiles.processFitFile` mutation returns a tRPC error.                                                                  | The user sees a "Processing failed, please try again" message.                                            |

---

## 4. Data Consistency

This new architecture ensures data consistency through the following mechanisms:

1.  **Transactional Processing:** The server-side processing (`Download -> Parse -> Calculate -> Store`) is designed to be a single, atomic transaction. If any step in this pipeline fails, the entire process is rolled back. No partial data (i.e., an `activity` record without its metrics) will be written to the database.
2.  **Single Source of Truth:** The uploaded FIT file in S3 acts as the immutable source of truth for the activity. The data in the `activities` table is derived directly from this file.
3.  **Decoupled Upload and Processing:** By separating the file upload from the data processing, we reduce the chance of data inconsistencies. The `processFitFile` mutation is only called _after_ the file is confirmed to be in S3, ensuring that the server has the necessary data before it begins its work. If the upload fails, the processing step is never initiated, and no inconsistent data is created.
