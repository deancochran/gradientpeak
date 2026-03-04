# Specification: Coaching, Messaging, and Notifications

## 1. Vision

This specification outlines a major enhancement to the application, introducing a suite of features for coaching, messaging, and notifications. The goal is to create a more interactive and engaging experience for our users, enabling them to connect, communicate, and collaborate in new ways.

The coaching feature will allow users to establish coaching relationships, where coaches can provide guidance and support to athletes. The messaging feature will provide a real-time communication channel for users to connect with each other. The notifications feature will keep users informed about important events and activities within the application.

## 2. High-Level Description

### 2.1. Coaching

- **Coaching Relationships:** Users can invite other users to be their coach. Invitations can be accepted or declined.
- **Coach Privileges:** Coaches can have admin-level privileges to edit the user's schedule, add profile metrics, and help the user achieve their goals.
- **Attribution:** All edits made by a coach must be attributed to the coach.

### 2.2. Messaging

- **Conversations:** One-to-one and group conversations.
- **Text-Only:** Messages are text-only.
- **Soft Deletion:** Soft-deletion of messages.

### 2.3. Notifications

- **In-App Notification Center:** A persistent, server-backed in-app notification center.
- **Notification Types:** Notifications for new messages, new followers, coaching invitations, etc.
- **Read/Unread:** Notifications should be marked as read/unread.

## 3. Scope

This project will involve the following:

- **Database Schema:** A new database schema to support the new features.
- **Backend:** New backend services to support the new features.
- **Frontend:** New frontend components and screens to support the new features.

## 4. Non-Requirements

- **Coaching Feature:** The coaching feature is web-only. There will be no UI/UX changes for coaching in the mobile application.
- **Notifications and Messaging:** The notifications and messaging features will be implemented on both web and mobile.

## 5. Success Metrics

- **User Engagement:** Increased user engagement with the application.
- **User Satisfaction:** Increased user satisfaction with the application.
- **User Adoption:** High adoption of the new features.
