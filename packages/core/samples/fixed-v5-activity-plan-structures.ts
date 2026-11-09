/** Static V5 source catalogue: steps and one-level repeats, no legacy runtime reader. */
import { type ActivityPlanStructure, activityPlanStructureSchema } from "../activity-plan";
import { REFERENCE_ASSESSMENT_ACTIVITIES } from "./assessment-activities";
import { withCatalogStepNotes } from "./step-note-policy";

const byTemplateId: Record<string, unknown> = {
  "8a1b2c3d-4e5f-4a7b-8c9d-0e1f2a3b4c5d": {
    version: 5,
    activity_category: "bike",
    items: [
      {
        type: "step",
        id: "c330e956-0f7c-45a2-9bc8-009326b94cdf",
        name: "Progressive Warm-up",
        instructions:
          "Notes:\nStart easy and build gradually. Include some leg openers.\n\nBlock context:\nSegment: bike activity\n\nInterval:\nProgressive Warm-up",
        duration: {
          type: "time",
          seconds: 900,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 60,
          },
        ],
      },
      {
        type: "repeat",
        id: "0976e350-55c2-4f9c-a10e-32c50c9fe679",
        count: 3,
        steps: [
          {
            type: "step",
            id: "74079a2d-28bb-4ee1-9c6f-95026fdc49b6",
            name: "Activation Effort",
            instructions:
              "Notes:\nHard but controlled effort\n\nBlock context:\nSegment: bike activity\n\nInterval:\nInterval 2",
            duration: {
              type: "time",
              seconds: 30,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 120,
              },
            ],
          },
          {
            type: "step",
            id: "df4c0572-9300-4926-b7e4-34c75aede87b",
            name: "Recovery",
            instructions: "Notes:\nComplete recovery before next effort",
            duration: {
              type: "time",
              seconds: 150,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 55,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "89f663d0-d542-4f1c-a18e-b2458c1f66f9",
        name: "Preparation",
        instructions:
          "Notes:\nMental preparation for the main set\n\nBlock context:\nSegment: bike activity\n\nInterval:\nPreparation",
        duration: {
          type: "time",
          seconds: 300,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 55,
          },
        ],
      },
      {
        type: "repeat",
        id: "138039a6-5fcc-45f2-ab18-10a336c95cef",
        count: 5,
        steps: [
          {
            type: "step",
            id: "42d51caf-f689-4063-9a6d-7feca51233a0",
            name: "VO2 Max Interval",
            instructions:
              "Notes:\nSustained effort at VO2 max power. Focus on smooth breathing.\n\nBlock context:\nSegment: bike activity\n\nInterval:\nInterval 4",
            duration: {
              type: "time",
              seconds: 300,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 110,
              },
            ],
          },
          {
            type: "step",
            id: "ad1a87f4-61ce-4ba8-9582-1eb1f88b6afd",
            name: "Recovery",
            instructions: "Notes:\nActive recovery. Heart rate should come down significantly.",
            duration: {
              type: "time",
              seconds: 240,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 55,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "3fac65d2-f360-4986-9744-9427ba4d48db",
        name: "Cool-down",
        instructions:
          "Notes:\nTake time to cool down properly after intense efforts\n\nBlock context:\nSegment: bike activity\n\nInterval:\nCool-down",
        duration: {
          type: "time",
          seconds: 900,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 50,
          },
        ],
      },
    ],
  },
  "0c3d4e5f-6a7b-4c9d-8e1f-2a3b4c5d6e7f": {
    version: 5,
    activity_category: "bike",
    items: [
      {
        type: "step",
        id: "7feca512-33a0-49c6-9784-54e77a0d089b",
        name: "Progressive Warm-up",
        instructions:
          "Notes:\nInclude some higher cadence work to prepare for sprints\n\nBlock context:\nSegment: bike activity\n\nInterval:\nProgressive Warm-up",
        duration: {
          type: "time",
          seconds: 900,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 60,
          },
        ],
      },
      {
        type: "repeat",
        id: "a91683f0-f562-4f3c-81ae-d265ac3f8619",
        count: 3,
        steps: [
          {
            type: "step",
            id: "4cdf7205-0093-46b9-a477-3daa1784f15e",
            name: "Sprint Opener",
            instructions:
              "Notes:\nAll-out sprint from moderate speed\n\nBlock context:\nSegment: bike activity\n\nInterval:\nInterval 2",
            duration: {
              type: "time",
              seconds: 10,
            },
            targets: [
              {
                type: "RPE",
                intensity: 10,
              },
            ],
          },
          {
            type: "step",
            id: "d340f966-1f8c-45b2-abd8-50e376099c2f",
            name: "Recovery",
            instructions: "Notes:\nComplete recovery",
            duration: {
              type: "time",
              seconds: 230,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 55,
              },
            ],
          },
        ],
      },
      {
        type: "repeat",
        id: "e87b0ea1-34c7-4aed-90e3-117eeb585dca",
        count: 6,
        steps: [
          {
            type: "step",
            id: "29960370-75e2-4fbc-812e-52e52cbf0699",
            name: "Max Sprint",
            instructions:
              "Notes:\nAll-out sprint - maximum power output\n\nBlock context:\nSegment: bike activity\n\nInterval:\nInterval 3",
            duration: {
              type: "time",
              seconds: 15,
            },
            targets: [
              {
                type: "RPE",
                intensity: 10,
              },
            ],
          },
          {
            type: "step",
            id: "da6db447-8e21-48fb-82d5-67d48dfa1b88",
            name: "Recovery",
            instructions: "Notes:\nComplete recovery is essential for quality",
            duration: {
              type: "time",
              seconds: 345,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 50,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "e679c053-32c5-4c9f-be11-eb58117e37a4",
        name: "Cool-down",
        instructions:
          "Notes:\nEasy spinning to flush lactate\n\nBlock context:\nSegment: bike activity\n\nInterval:\nCool-down",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 50,
          },
        ],
      },
    ],
  },
  "1d4e5f6a-7b8c-4d0e-9f2a-3b4c5d6e7f8a": {
    version: 5,
    activity_category: "bike",
    items: [
      {
        type: "step",
        id: "b84bde71-0497-4abd-a0b3-a10e7be8ed5a",
        name: "Easy Warm-up",
        instructions:
          "Notes:\nSpin easy, focus on smooth pedaling and preparing the legs\n\nBlock context:\nSegment: bike activity\n\nInterval:\nEasy Warm-up",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 60,
          },
        ],
      },
      {
        type: "step",
        id: "e3500976-2f9c-45c2-bbe8-20b346d96cff",
        name: "Gradual Build",
        instructions:
          "Notes:\nSteadily increase intensity to get near threshold\n\nBlock context:\nSegment: bike activity\n\nInterval:\nGradual Build",
        duration: {
          type: "time",
          seconds: 300,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 75,
          },
        ],
      },
      {
        type: "repeat",
        id: "af1cd542-63d0-49f6-87b4-44d76afdf88b",
        count: 4,
        steps: [
          {
            type: "step",
            id: "7e1158eb-ca5d-4437-a679-f36019863fac",
            name: "Threshold Interval",
            instructions:
              "Notes:\nMaintain steady cadence, focus on consistent threshold effort\n\nBlock context:\nSegment: bike activity\n\nInterval:\nInterval 3",
            duration: {
              type: "time",
              seconds: 300,
            },
            targets: [
              {
                type: "%ThresholdHR",
                intensity: 100,
              },
            ],
          },
          {
            type: "step",
            id: "55c22f9c-0976-4350-ad5a-f689d06342d5",
            name: "Recovery",
            instructions: "Notes:\nSpin easy to recover, prepare for next interval",
            duration: {
              type: "time",
              seconds: 150,
            },
            targets: [
              {
                type: "%ThresholdHR",
                intensity: 65,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "f15ecb38-3daa-4784-99c6-2abd0497de71",
        name: "Cool-down",
        instructions:
          "Notes:\nSpin easy, focus on relaxed breathing and form\n\nBlock context:\nSegment: bike activity\n\nInterval:\nCool-down",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 55,
          },
        ],
      },
    ],
  },
  "d2c8f1a0-5b9e-4e3a-8f7d-9c6b4a2e1f0d": {
    version: 5,
    activity_category: "bike",
    items: [
      {
        type: "step",
        id: "8ffcb522-43b0-49d6-a794-24b74addd86b",
        name: "Warmup",
        instructions:
          "Notes:\nEasy spin to warm up\n\nBlock context:\nSegment: bike activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 60,
          },
        ],
      },
      {
        type: "step",
        id: "8013a639-cc5f-4285-98ab-1986f36065d2",
        name: "Build",
        instructions:
          "Notes:\nGradually increase intensity\n\nBlock context:\nSegment: bike activity\n\nInterval:\nBuild",
        duration: {
          type: "time",
          seconds: 300,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 75,
          },
        ],
      },
      {
        type: "repeat",
        id: "dc6f0295-9023-4649-b407-8dfa67d441ae",
        count: 3,
        steps: [
          {
            type: "step",
            id: "c936a310-1582-4f5c-a1ce-72054cdf26b9",
            name: "Sweet Spot",
            instructions:
              "Notes:\nSteady effort in sweet spot zone\n\nBlock context:\nSegment: bike activity\n\nInterval:\nSweet Spot",
            duration: {
              type: "time",
              seconds: 600,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 90,
              },
            ],
          },
          {
            type: "step",
            id: "c659a033-12a5-4c7f-9ef1-4bb871de9704",
            name: "Recovery",
            instructions: "Notes:\nEasy recovery spin",
            duration: {
              type: "time",
              seconds: 300,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 55,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "12a5ec7f-c659-4033-aa3d-8ffcb52243b0",
        name: "Cooldown",
        instructions:
          "Notes:\nEasy spin to cool down\n\nBlock context:\nSegment: bike activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 50,
          },
        ],
      },
    ],
  },
  "e3d9a2b1-6c0f-5f4b-9a8e-0d7c5b3f2a1e": {
    version: 5,
    activity_category: "bike",
    items: [
      {
        type: "step",
        id: "009326b9-4cdf-4205-982b-990673e0e552",
        name: "Warmup",
        instructions: "Block context:\nSegment: bike activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 900,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 65,
          },
        ],
      },
      {
        type: "repeat",
        id: "ba4d9427-6e01-48db-a2b5-c734ed5a7be8",
        count: 5,
        steps: [
          {
            type: "step",
            id: "49b62390-9502-4fdc-a14e-f285cc5fa639",
            name: "Hard",
            instructions:
              "Notes:\nMaximum sustainable effort\n\nBlock context:\nSegment: bike activity\n\nInterval:\nVO2 Max",
            duration: {
              type: "time",
              seconds: 180,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 120,
              },
            ],
          },
          {
            type: "step",
            id: "8c1fb245-40d3-46f9-a4b7-fd6ad744b11e",
            name: "Recovery",
            instructions: "Notes:\nFull recovery",
            duration: {
              type: "time",
              seconds: 180,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 50,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "3acd14a7-ee81-485b-a235-47b46ddafb68",
        name: "Cooldown",
        instructions: "Block context:\nSegment: bike activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 55,
          },
        ],
      },
    ],
  },
  "f4e0b3c2-7d1a-4a5c-8b9f-1e8d6c4a3b2f": {
    version: 5,
    activity_category: "bike",
    items: [
      {
        type: "step",
        id: "af1cd542-63d0-49f6-87b4-44d76afdf88b",
        name: "Warmup",
        instructions: "Block context:\nSegment: bike activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 900,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 65,
          },
        ],
      },
      {
        type: "repeat",
        id: "2592ff6c-d946-4320-bd2a-0699e07352e5",
        count: 4,
        steps: [
          {
            type: "step",
            id: "7c0fa235-30c3-46e9-94a7-2d9a0774e14e",
            name: "Threshold",
            instructions:
              "Notes:\nAt threshold - max sustainable for 1 hour\n\nBlock context:\nSegment: bike activity\n\nInterval:\nThreshold",
            duration: {
              type: "time",
              seconds: 480,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 95,
              },
            ],
          },
          {
            type: "step",
            id: "b320d946-ff6c-4592-8bb8-30c356e97c0f",
            name: "Recovery",
            duration: {
              type: "time",
              seconds: 240,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 55,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "a5127fec-59c6-43a0-bdaa-861960f3d265",
        name: "Cooldown",
        instructions: "Block context:\nSegment: bike activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 60,
          },
        ],
      },
    ],
  },
  "8e1f2a3b-4c5d-4e7f-8a9b-0c1d2e3f4a5b": {
    version: 5,
    activity_category: "run",
    items: [
      {
        type: "step",
        id: "be51982b-0a9d-4477-a6b9-b320d946ff6c",
        name: "Progressive Warm-up",
        instructions:
          "Notes:\nEasy pace jogging to prepare legs and lungs\n\nBlock context:\nSegment: run activity\n\nInterval:\nProgressive Warm-up",
        duration: {
          type: "time",
          seconds: 900,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 60,
          },
        ],
      },
      {
        type: "repeat",
        id: "f4871aad-a83b-4e61-9cef-1582ef5cc936",
        count: 4,
        steps: [
          {
            type: "step",
            id: "4dba2794-016e-4b48-b522-3ed118ab8a1d",
            name: "Threshold Interval",
            instructions:
              "Notes:\nSteady effort at high intensity\n\nBlock context:\nSegment: run activity\n\nInterval:\nInterval 2",
            duration: {
              type: "time",
              seconds: 300,
            },
            targets: [
              {
                type: "%ThresholdHR",
                intensity: 95,
              },
            ],
          },
          {
            type: "step",
            id: "ea7dc457-9e31-480b-92e5-37a45dcaeb58",
            name: "Active Recovery",
            instructions:
              "Notes:\nJog very easily; walk briefly if needed. Let heart rate fall naturally rather than chasing the target immediately after the effort.",
            duration: {
              type: "time",
              seconds: 180,
            },
            targets: [
              {
                type: "%ThresholdHR",
                intensity: 70,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "74079a2d-28bb-4ee1-9c6f-95026fdc49b6",
        name: "Cool-down",
        instructions:
          "Notes:\nRelaxed pace to flush lactate\n\nBlock context:\nSegment: run activity\n\nInterval:\nCool-down",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 70,
          },
        ],
      },
    ],
  },
  "9f2a3b4c-5d6e-4f8a-9b0c-1d2e3f4a5b6c": {
    version: 5,
    activity_category: "run",
    items: [
      {
        type: "step",
        id: "12a5ec7f-c659-4033-aa3d-8ffcb52243b0",
        name: "Warm-up Jog",
        instructions:
          "Notes:\nGradually increase speed to prep for intervals\n\nBlock context:\nSegment: run activity\n\nInterval:\nWarm-up Jog",
        duration: {
          type: "time",
          seconds: 900,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 60,
          },
        ],
      },
      {
        type: "repeat",
        id: "bc4fe275-7003-4629-94e7-ed5ac734a10e",
        count: 3,
        steps: [
          {
            type: "step",
            id: "e552bf2c-9906-43e0-bdea-46d920b39225",
            name: "Long Threshold Interval",
            instructions:
              "Notes:\nMaintain pace comfortably hard\n\nBlock context:\nSegment: run activity\n\nInterval:\nInterval 2",
            duration: {
              type: "time",
              seconds: 480,
            },
            targets: [
              {
                type: "%ThresholdHR",
                intensity: 95,
              },
            ],
          },
          {
            type: "step",
            id: "a6398013-f285-4c5f-bed1-2b9851be77e4",
            name: "Recovery Jog",
            instructions:
              "Notes:\nJog very easily with relaxed breathing. Let heart rate fall naturally; do not speed up to chase the recovery target.",
            duration: {
              type: "time",
              seconds: 300,
            },
            targets: [
              {
                type: "%ThresholdHR",
                intensity: 60,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "3ccf62f5-f083-46a9-9467-6dda47b4218e",
        name: "Short Threshold Push",
        instructions:
          "Notes:\nPush pace for short duration\n\nBlock context:\nSegment: run activity\n\nInterval:\nShort Threshold Push",
        duration: {
          type: "time",
          seconds: 180,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 95,
          },
        ],
      },
      {
        type: "step",
        id: "1f8c45b2-d340-4966-b724-f4871aada83b",
        name: "Cool-down",
        instructions:
          "Notes:\nRelaxed pace to normalize heart rate\n\nBlock context:\nSegment: run activity\n\nInterval:\nCool-down",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 60,
          },
        ],
      },
    ],
  },
  "0a3b4c5d-6e7f-4a9b-8c1d-2e3f4a5b6c7d": {
    version: 5,
    activity_category: "run",
    items: [
      {
        type: "step",
        id: "d265ac3f-8619-40f3-aafd-cf3cf56283f0",
        name: "Progressive Warm-up",
        instructions:
          "Notes:\nInclude some strides in final 5 minutes to prepare for speed\n\nBlock context:\nSegment: run activity\n\nInterval:\nProgressive Warm-up",
        duration: {
          type: "time",
          seconds: 900,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 65,
          },
        ],
      },
      {
        type: "repeat",
        id: "fc8f22b5-b043-4669-9427-ad1a87f461ce",
        count: 6,
        steps: [
          {
            type: "step",
            id: "77e49d0a-2b98-41be-9f4c-bc4fe2757003",
            name: "Speed Interval",
            instructions:
              "Notes:\nFast pace - should feel hard but controlled\n\nBlock context:\nSegment: run activity\n\nInterval:\nInterval 2",
            duration: {
              type: "time",
              seconds: 180,
            },
            targets: [
              {
                type: "%ThresholdHR",
                intensity: 105,
              },
            ],
          },
          {
            type: "step",
            id: "ee81c85b-3acd-44a7-96e9-a310c936ef5c",
            name: "Recovery Jog",
            instructions:
              "Notes:\nJog very easily; walk briefly if needed to regain controlled breathing before the next fast interval.",
            duration: {
              type: "time",
              seconds: 120,
            },
            targets: [
              {
                type: "%ThresholdHR",
                intensity: 65,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "7c0fa235-30c3-46e9-94a7-2d9a0774e14e",
        name: "Cool-down",
        instructions:
          "Notes:\nEasy pace to bring heart rate down\n\nBlock context:\nSegment: run activity\n\nInterval:\nCool-down",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 60,
          },
        ],
      },
    ],
  },
  "2c5d6e7f-8a9b-4c1d-ae3f-4a5b6c7d8e9f": {
    version: 5,
    activity_category: "run",
    items: [
      {
        type: "step",
        id: "12a5ec7f-c659-4033-aa3d-8ffcb52243b0",
        name: "Flat Warm-up",
        instructions:
          "Notes:\nStart on 0% grade, gradually increase pace\n\nBlock context:\nSegment: run activity\n\nInterval:\nFlat Warm-up",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 65,
          },
        ],
      },
      {
        type: "repeat",
        id: "28bb4ee1-7407-4a2d-9023-d13eab181d8a",
        count: 8,
        steps: [
          {
            type: "step",
            id: "37a45dca-eb58-417e-9f0c-fc8f22b5b043",
            name: "Hill Climb",
            instructions:
              "Notes:\nIncrease incline to 6-8%, maintain strong effort uphill\n\nBlock context:\nSegment: run activity\n\nInterval:\nInterval 2",
            duration: {
              type: "time",
              seconds: 120,
            },
            targets: [
              {
                type: "%ThresholdHR",
                intensity: 90,
              },
            ],
          },
          {
            type: "step",
            id: "1eb1f88b-6afd-44d7-8619-138039a65fcc",
            name: "Recovery Descent",
            instructions: "Notes:\nReturn to 0% grade, easy jog to recover",
            duration: {
              type: "time",
              seconds: 90,
            },
            targets: [
              {
                type: "%ThresholdHR",
                intensity: 65,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "a83bce61-f487-4aad-90a3-51be2b989d0a",
        name: "Cool-down",
        instructions:
          "Notes:\nFlat grade, easy pace to cool down\n\nBlock context:\nSegment: run activity\n\nInterval:\nCool-down",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 60,
          },
        ],
      },
    ],
  },
  "4c7d8e9f-0a1b-4c3d-8e5f-6a7b8c9d0e1f": {
    version: 5,
    activity_category: "run",
    items: [
      {
        type: "step",
        id: "12a5ec7f-c659-4033-aa3d-8ffcb52243b0",
        name: "Warm-up",
        instructions:
          "Notes:\nStart easy and gradually build pace\n\nBlock context:\nSegment: run activity\n\nInterval:\nWarm-up",
        duration: {
          type: "time",
          seconds: 900,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 65,
          },
        ],
      },
      {
        type: "repeat",
        id: "009326b9-4cdf-4205-982b-990673e0e552",
        count: 6,
        steps: [
          {
            type: "step",
            id: "37a45dca-eb58-417e-9f0c-fc8f22b5b043",
            name: "5K Pace Interval",
            instructions:
              "Notes:\nRun at your 5K race pace - this should feel hard\n\nBlock context:\nSegment: run activity\n\nInterval:\nInterval 2",
            duration: {
              type: "time",
              seconds: 180,
            },
            targets: [
              {
                type: "%ThresholdHR",
                intensity: 95,
              },
            ],
          },
          {
            type: "step",
            id: "a6398013-f285-4c5f-bed1-2b9851be77e4",
            name: "Recovery Jog",
            instructions: "Notes:\nActive recovery - keep moving but very easy",
            duration: {
              type: "time",
              seconds: 120,
            },
            targets: [
              {
                type: "%ThresholdHR",
                intensity: 70,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "8013a639-cc5f-4285-98ab-1986f36065d2",
        name: "Cool-down",
        instructions:
          "Notes:\nEasy pace to bring heart rate down\n\nBlock context:\nSegment: run activity\n\nInterval:\nCool-down",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 65,
          },
        ],
      },
    ],
  },
  "6e9f0a1b-2c3d-4e5f-aa7b-8c9d0e1f2a3b": {
    version: 5,
    activity_category: "run",
    items: [
      {
        type: "step",
        id: "61ce3ba8-ad1a-47f4-8936-da6db4478e21",
        name: "Warm-up",
        instructions:
          "Notes:\nStart easy and prepare for varied efforts\n\nBlock context:\nSegment: run activity\n\nInterval:\nWarm-up",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 65,
          },
        ],
      },
      {
        type: "repeat",
        id: "33a059c6-7fec-4512-8b38-b043d669fc8f",
        count: 8,
        steps: [
          {
            type: "step",
            id: "c2559c2f-7609-40e3-9aed-ff6c2592b320",
            name: "Hard Surge",
            instructions:
              "Notes:\nSurge to hard effort - use terrain and feel\n\nBlock context:\nSegment: run activity\n\nInterval:\nInterval 2",
            duration: {
              type: "time",
              seconds: 90,
            },
            targets: [
              {
                type: "%ThresholdHR",
                intensity: 90,
              },
            ],
          },
          {
            type: "step",
            id: "95026fdc-49b6-4390-ad9a-b64990230295",
            name: "Easy Recovery",
            instructions: "Notes:\nRelax and recover between surges",
            duration: {
              type: "time",
              seconds: 150,
            },
            targets: [
              {
                type: "%ThresholdHR",
                intensity: 70,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "b320d946-ff6c-4592-8bb8-30c356e97c0f",
        name: "Cool-down",
        instructions:
          "Notes:\nEasy pace to bring heart rate down\n\nBlock context:\nSegment: run activity\n\nInterval:\nCool-down",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 65,
          },
        ],
      },
    ],
  },
  "c7d3e6f5-0a4b-4c8d-be2f-4a1b7c6d5e3a": {
    version: 5,
    activity_category: "run",
    items: [
      {
        type: "step",
        id: "a91683f0-f562-4f3c-81ae-d265ac3f8619",
        name: "Warmup",
        instructions: "Block context:\nSegment: run activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 900,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 65,
          },
        ],
      },
      {
        type: "repeat",
        id: "3ba861ce-87f4-4d1a-a310-48db6e019427",
        count: 6,
        steps: [
          {
            type: "step",
            id: "d265ac3f-8619-40f3-aafd-cf3cf56283f0",
            name: "Fast",
            instructions:
              "Notes:\nThreshold pace\n\nBlock context:\nSegment: run activity\n\nInterval:\nIntervals",
            duration: {
              type: "distance",
              meters: 1000,
            },
            targets: [
              {
                type: "%ThresholdHR",
                intensity: 95,
              },
            ],
          },
          {
            type: "step",
            id: "ad1a87f4-61ce-4ba8-9582-1eb1f88b6afd",
            name: "Recovery",
            instructions: "Notes:\nEasy jog",
            duration: {
              type: "time",
              seconds: 120,
            },
            targets: [
              {
                type: "%ThresholdHR",
                intensity: 60,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "bb28e14e-0774-4d9a-a390-c85bee8114a7",
        name: "Cooldown",
        instructions: "Block context:\nSegment: run activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 60,
          },
        ],
      },
    ],
  },
  "7e5f8a9b-1c4d-4e6f-8a2b-9c1d3e5f7a9b": {
    version: 5,
    activity_category: "run",
    items: [
      {
        type: "step",
        id: "7e1158eb-ca5d-4437-a679-f36019863fac",
        name: "Warmup",
        instructions:
          "Notes:\nEase in and settle into relaxed aerobic rhythm.\n\nBlock context:\nSegment: run activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 900,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 65,
          },
        ],
      },
      {
        type: "step",
        id: "95026fdc-49b6-4390-ad9a-b64990230295",
        name: "Aerobic Settling",
        instructions:
          "Notes:\nStay smooth and controlled before race-pace work begins.\n\nBlock context:\nSegment: run activity\n\nInterval:\nAerobic Settling",
        duration: {
          type: "time",
          seconds: 2400,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 70,
          },
        ],
      },
      {
        type: "step",
        id: "4cdf7205-0093-46b9-a477-3daa1784f15e",
        name: "Marathon Pace",
        instructions:
          "Notes:\nControlled race pace with strong form and even effort.\n\nBlock context:\nSegment: run activity\n\nInterval:\nMarathon Pace",
        duration: {
          type: "time",
          seconds: 1200,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 80,
          },
        ],
      },
      {
        type: "step",
        id: "e3500976-2f9c-45c2-bbe8-20b346d96cff",
        name: "Cooldown",
        instructions:
          "Notes:\nRelax the pace and finish under control.\n\nBlock context:\nSegment: run activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 60,
          },
        ],
      },
    ],
  },
  "df4c0572-9300-4926-b7e4-34c75aede87b": {
    version: 5,
    activity_category: "run",
    items: [
      {
        type: "step",
        id: "fa8dd467-ae41-481b-a2f5-87f4ad1a3ba8",
        name: "Warmup",
        instructions:
          "Notes:\nTwo easy laps before controlled fast running.\n\nBlock context:\nSegment: run activity\n\nInterval:\nWarmup",
        duration: {
          type: "distance",
          meters: 800,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 65,
          },
        ],
      },
      {
        type: "repeat",
        id: "cc5ff285-8013-4639-a4f7-bd2a970471de",
        count: 5,
        steps: [
          {
            type: "step",
            id: "b9269300-0572-4f4c-91be-a2357c0f56e9",
            name: "Fast Stride",
            instructions:
              "Notes:\nFast but relaxed on the straightaway; focus on form, not sprinting.\n\nBlock context:\nSegment: run activity\n\nInterval:\nStrides",
            duration: {
              type: "distance",
              meters: 100,
            },
            targets: [
              {
                type: "RPE",
                intensity: 8,
              },
            ],
          },
          {
            type: "step",
            id: "46d920b3-9225-4cff-9e71-cb38f15e1784",
            name: "Walk Recovery",
            instructions:
              "Notes:\nWalk back to the starting line on a permitted route clear of active lanes; never reverse against track traffic.",
            duration: {
              type: "distance",
              meters: 100,
            },
            targets: [
              {
                type: "RPE",
                intensity: 2,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "4cdf7205-0093-46b9-a477-3daa1784f15e",
        name: "Cooldown",
        instructions:
          "Notes:\nTwo easy laps to finish loose.\n\nBlock context:\nSegment: run activity\n\nInterval:\nCooldown",
        duration: {
          type: "distance",
          meters: 800,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 60,
          },
        ],
      },
    ],
  },
  "96297003-e275-4c4f-aec1-5bc881eea714": {
    version: 5,
    activity_category: "run",
    items: [
      {
        type: "step",
        id: "33a059c6-7fec-4512-8b38-b043d669fc8f",
        name: "Warmup",
        instructions:
          "Notes:\nFour easy laps before the repeat set.\n\nBlock context:\nSegment: run activity\n\nInterval:\nWarmup",
        duration: {
          type: "distance",
          meters: 1600,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 65,
          },
        ],
      },
      {
        type: "repeat",
        id: "a91683f0-f562-4f3c-81ae-d265ac3f8619",
        count: 16,
        steps: [
          {
            type: "step",
            id: "f88b1eb1-44d7-4afd-a0f3-61ce3ba8ad1a",
            name: "Fast 200m",
            instructions:
              "Notes:\nFast, smooth, and controlled; keep mechanics crisp.\n\nBlock context:\nSegment: run activity\n\nInterval:\n200m Repeats",
            duration: {
              type: "distance",
              meters: 200,
            },
            targets: [
              {
                type: "RPE",
                intensity: 9,
              },
            ],
          },
          {
            type: "step",
            id: "2f9c55c2-e350-4976-8734-c457ea7d780b",
            name: "Recovery 200m",
            instructions:
              "Notes:\nJog the remaining 200 m around the track to your original starting line.",
            duration: {
              type: "distance",
              meters: 200,
            },
            targets: [
              {
                type: "RPE",
                intensity: 2,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "29960370-75e2-4fbc-812e-52e52cbf0699",
        name: "Cooldown",
        instructions: "Block context:\nSegment: run activity\n\nInterval:\nCooldown",
        duration: {
          type: "distance",
          meters: 1600,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 60,
          },
        ],
      },
    ],
  },
  "c457ea7d-780b-4e31-acbf-2592ff6cd946": {
    version: 5,
    activity_category: "run",
    items: [
      {
        type: "step",
        id: "c330e956-0f7c-45a2-9bc8-009326b94cdf",
        name: "Warmup",
        instructions:
          "Notes:\nFour easy laps with drills or strides if desired.\n\nBlock context:\nSegment: run activity\n\nInterval:\nWarmup",
        duration: {
          type: "distance",
          meters: 1600,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 65,
          },
        ],
      },
      {
        type: "repeat",
        id: "9d0a77e4-51be-4b98-8572-4ee128bb9a2d",
        count: 8,
        steps: [
          {
            type: "step",
            id: "760950e3-c255-4c2f-8ea1-bb28e14e0774",
            name: "Fast 400m",
            instructions:
              "Notes:\nOne lap at controlled 10K to 5K effort.\n\nBlock context:\nSegment: run activity\n\nInterval:\n400m Repeats",
            duration: {
              type: "distance",
              meters: 400,
            },
            targets: [
              {
                type: "RPE",
                intensity: 8,
              },
            ],
          },
          {
            type: "step",
            id: "df4c0572-9300-4926-b7e4-34c75aede87b",
            name: "Rest",
            instructions:
              "Notes:\nRest near the starting line, clear of active lanes; return to the line for the next rep.",
            duration: {
              type: "time",
              seconds: 60,
            },
            targets: [
              {
                type: "rest",
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "1d8af764-d13e-4b18-85f2-ce61a83b1aad",
        name: "Cooldown",
        instructions: "Block context:\nSegment: run activity\n\nInterval:\nCooldown",
        duration: {
          type: "distance",
          meters: 1600,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 60,
          },
        ],
      },
    ],
  },
  "7be8a10e-c734-4d5a-a350-089b2ec154e7": {
    version: 5,
    activity_category: "run",
    items: [
      {
        type: "step",
        id: "bc4fe275-7003-4629-94e7-ed5ac734a10e",
        name: "Warmup",
        instructions:
          "Notes:\nEight easy laps before the benchmark set.\n\nBlock context:\nSegment: run activity\n\nInterval:\nWarmup",
        duration: {
          type: "distance",
          meters: 3200,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 65,
          },
        ],
      },
      {
        type: "repeat",
        id: "ca5da437-7e11-48eb-b2c5-9704bd2a4bb8",
        count: 8,
        steps: [
          {
            type: "step",
            id: "d946b320-2592-4f6c-b1de-c2559c2f7609",
            name: "800m Repeat",
            instructions:
              "Notes:\nTwo laps at a consistent comfortably hard effort.\n\nBlock context:\nSegment: run activity\n\nInterval:\nYasso 800s",
            duration: {
              type: "distance",
              meters: 800,
            },
            targets: [
              {
                type: "RPE",
                intensity: 8,
              },
            ],
          },
          {
            type: "step",
            id: "20b346d9-6cff-4225-b84b-39a6138085f2",
            name: "Recovery 400m",
            instructions: "Notes:\nOne easy lap recovery; keep it relaxed.",
            duration: {
              type: "distance",
              meters: 400,
            },
            targets: [
              {
                type: "RPE",
                intensity: 2,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "4add24b7-fe91-486b-b245-17843daacb38",
        name: "Cooldown",
        instructions: "Block context:\nSegment: run activity\n\nInterval:\nCooldown",
        duration: {
          type: "distance",
          meters: 1600,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 60,
          },
        ],
      },
    ],
  },
  "6afd44d7-1eb1-488b-9265-b724dd4a6bd8": {
    version: 5,
    activity_category: "run",
    items: [
      {
        type: "step",
        id: "33a059c6-7fec-4512-8b38-b043d669fc8f",
        name: "Warmup",
        instructions: "Block context:\nSegment: run activity\n\nInterval:\nWarmup",
        duration: {
          type: "distance",
          meters: 1600,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 65,
          },
        ],
      },
      {
        type: "repeat",
        id: "75e24fbc-2996-4370-8d7a-96297003e275",
        count: 3,
        steps: [
          {
            type: "step",
            id: "881bae41-d467-4a8d-b083-b11e8bf8fd6a",
            name: "1600m Repeat",
            instructions:
              "Notes:\nFour laps just slower than 5K effort; prioritize even pacing.\n\nBlock context:\nSegment: run activity\n\nInterval:\nMile Repeats",
            duration: {
              type: "distance",
              meters: 1600,
            },
            targets: [
              {
                type: "RPE",
                intensity: 8,
              },
            ],
          },
          {
            type: "step",
            id: "af1cd542-63d0-49f6-87b4-44d76afdf88b",
            name: "Recovery 400m",
            instructions: "Notes:\nOne lap easy jog recovery.",
            duration: {
              type: "distance",
              meters: 400,
            },
            targets: [
              {
                type: "RPE",
                intensity: 2,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "f562cf3c-a916-43f0-8dfa-16a9f08362f5",
        name: "Cooldown",
        instructions: "Block context:\nSegment: run activity\n\nInterval:\nCooldown",
        duration: {
          type: "distance",
          meters: 1600,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 60,
          },
        ],
      },
    ],
  },
  "4cdf7205-0093-46b9-a477-3daa1784f15e": {
    version: 5,
    activity_category: "run",
    items: [
      {
        type: "step",
        id: "c12e9b08-0d7a-4754-a996-3acd14a7ee81",
        name: "Warmup",
        instructions:
          "Notes:\nFour easy laps before the ladder.\n\nBlock context:\nSegment: run activity\n\nInterval:\nWarmup",
        duration: {
          type: "distance",
          meters: 1600,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 65,
          },
        ],
      },
      {
        type: "step",
        id: "3ccf62f5-f083-46a9-9467-6dda47b4218e",
        name: "400m",
        instructions: "Block context:\nSegment: run activity\n\nInterval:\nLadder",
        duration: {
          type: "distance",
          meters: 400,
        },
        targets: [
          {
            type: "RPE",
            intensity: 8,
          },
        ],
      },
      {
        type: "step",
        id: "0d7ae754-c12e-4b08-b5e2-7e1158ebca5d",
        name: "Rest",
        instructions:
          "Notes:\nRest near the starting line, clear of active lanes; return to the line for the next rep.",
        duration: {
          type: "time",
          seconds: 90,
        },
        targets: [
          {
            type: "rest",
          },
        ],
      },
      {
        type: "step",
        id: "2ec1089b-7a0d-44e7-9629-63d089f6af1c",
        name: "800m",
        duration: {
          type: "distance",
          meters: 800,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 90,
          },
        ],
      },
      {
        type: "step",
        id: "17843daa-cb38-415e-bfec-5cef821510a3",
        name: "Rest",
        instructions:
          "Notes:\nRest near the starting line, clear of active lanes; return to the line for the next rep.",
        duration: {
          type: "time",
          seconds: 90,
        },
        targets: [
          {
            type: "rest",
          },
        ],
      },
      {
        type: "step",
        id: "60f38619-ac3f-4265-b88b-f966d34045b2",
        name: "1200m",
        duration: {
          type: "distance",
          meters: 1200,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 90,
          },
        ],
      },
      {
        type: "step",
        id: "91fe6bd8-dd4a-4724-b966-4add24b7fe91",
        name: "Recovery 400m",
        duration: {
          type: "distance",
          meters: 400,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
      {
        type: "step",
        id: "72054cdf-26b9-4093-8a9d-6fdc95022390",
        name: "1600m",
        duration: {
          type: "distance",
          meters: 1600,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 85,
          },
        ],
      },
      {
        type: "step",
        id: "cb38f15e-1784-4daa-b3a0-982bbe51e477",
        name: "Recovery 400m",
        duration: {
          type: "distance",
          meters: 400,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
      {
        type: "step",
        id: "24b74add-d86b-4e91-8c1f-85f25fcc39a6",
        name: "1200m",
        duration: {
          type: "distance",
          meters: 1200,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 90,
          },
        ],
      },
      {
        type: "step",
        id: "95026fdc-49b6-4390-ad9a-b64990230295",
        name: "Rest",
        instructions:
          "Notes:\nRest near the starting line, clear of active lanes; return to the line for the next rep.",
        duration: {
          type: "time",
          seconds: 90,
        },
        targets: [
          {
            type: "rest",
          },
        ],
      },
      {
        type: "step",
        id: "77e49d0a-2b98-41be-9f4c-bc4fe2757003",
        name: "800m",
        duration: {
          type: "distance",
          meters: 800,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 90,
          },
        ],
      },
      {
        type: "step",
        id: "0ea1e87b-5aed-44c7-b609-43b069d68ffc",
        name: "Rest",
        instructions:
          "Notes:\nRest near the starting line, clear of active lanes; return to the line for the next rep.",
        duration: {
          type: "time",
          seconds: 90,
        },
        targets: [
          {
            type: "rest",
          },
        ],
      },
      {
        type: "step",
        id: "ed5ac734-a10e-4be8-95c2-de71b84b2abd",
        name: "400m",
        duration: {
          type: "distance",
          meters: 400,
        },
        targets: [
          {
            type: "RPE",
            intensity: 9,
          },
        ],
      },
      {
        type: "step",
        id: "2b9851be-77e4-4d0a-9300-780b9e31c457",
        name: "Cooldown",
        instructions: "Block context:\nSegment: run activity\n\nInterval:\nCooldown",
        duration: {
          type: "distance",
          meters: 1600,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 60,
          },
        ],
      },
    ],
  },
  "9d2e3f4a-5b6c-4d8e-9f0a-1b2c3d4e5f6a": {
    version: 5,
    activity_category: "bike",
    items: [
      {
        type: "step",
        id: "5cef8215-10a3-46c9-b487-0d7ae754c12e",
        name: "Warm-up",
        instructions:
          "Notes:\nStart easy and gradually build intensity\n\nBlock context:\nSegment: bike activity\n\nInterval:\nWarm-up",
        duration: {
          type: "time",
          seconds: 900,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 55,
          },
        ],
      },
      {
        type: "repeat",
        id: "a6398013-f285-4c5f-bed1-2b9851be77e4",
        count: 3,
        steps: [
          {
            type: "step",
            id: "9b08c12e-e754-4d7a-8370-28bb4ee17407",
            name: "Sweet Spot Interval",
            instructions:
              "Notes:\nMaintain steady power in sweet spot zone (85-90% FTP)\n\nBlock context:\nSegment: bike activity\n\nInterval:\nInterval 2",
            duration: {
              type: "time",
              seconds: 900,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 90,
              },
            ],
          },
          {
            type: "step",
            id: "a033c659-ec7f-42a5-b8cb-b92693000572",
            name: "Easy Recovery",
            instructions: "Notes:\nEasy spinning to recover between intervals",
            duration: {
              type: "time",
              seconds: 300,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 50,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "26b90093-7205-4cdf-be51-ab18d13ef764",
        name: "Cool-down",
        instructions:
          "Notes:\nEasy spinning to bring heart rate down\n\nBlock context:\nSegment: bike activity\n\nInterval:\nCool-down",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 50,
          },
        ],
      },
    ],
  },
  "0e3f4a5b-6c7d-4e9f-8a1b-2c3d4e5f6a7b": {
    version: 5,
    activity_category: "bike",
    items: [
      {
        type: "step",
        id: "ad1a87f4-61ce-4ba8-9582-1eb1f88b6afd",
        name: "Progressive Warm-up",
        instructions:
          "Notes:\nGradually increase effort to prepare for tempo work\n\nBlock context:\nSegment: bike activity\n\nInterval:\nProgressive Warm-up",
        duration: {
          type: "time",
          seconds: 1200,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 60,
          },
        ],
      },
      {
        type: "step",
        id: "e87b0ea1-34c7-4aed-90e3-117eeb585dca",
        name: "Tempo Block 1",
        instructions:
          "Notes:\nSteady tempo effort - should feel moderately hard but sustainable\n\nBlock context:\nSegment: bike activity\n\nInterval:\nTempo Block 1",
        duration: {
          type: "time",
          seconds: 1200,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 80,
          },
        ],
      },
      {
        type: "step",
        id: "47b46dda-fb68-418e-af1c-cc5ff2858013",
        name: "Easy Recovery",
        instructions:
          "Notes:\nEasy spinning to recover\n\nBlock context:\nSegment: bike activity\n\nInterval:\nEasy Recovery",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 55,
          },
        ],
      },
      {
        type: "step",
        id: "12a5ec7f-c659-4033-aa3d-8ffcb52243b0",
        name: "Tempo Block 2",
        instructions:
          "Notes:\nMaintain same effort as first block\n\nBlock context:\nSegment: bike activity\n\nInterval:\nTempo Block 2",
        duration: {
          type: "time",
          seconds: 1200,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 80,
          },
        ],
      },
      {
        type: "step",
        id: "51be2b98-9d0a-47e4-b926-8a1d64f73ed1",
        name: "Cool-down",
        instructions:
          "Notes:\nEasy spinning to normalize heart rate\n\nBlock context:\nSegment: bike activity\n\nInterval:\nCool-down",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 50,
          },
        ],
      },
    ],
  },
  "1f4a5b6c-7d8e-4f0a-9b2c-3d4e5f6a7b8c": {
    version: 5,
    activity_category: "bike",
    items: [
      {
        type: "step",
        id: "89f663d0-d542-4f1c-a18e-b2458c1f66f9",
        name: "Warm-up",
        instructions:
          "Notes:\nInclude some brief higher efforts to open the legs\n\nBlock context:\nSegment: bike activity\n\nInterval:\nWarm-up",
        duration: {
          type: "time",
          seconds: 900,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 60,
          },
        ],
      },
      {
        type: "repeat",
        id: "db48016e-2794-4dba-83b0-e87b0ea134c7",
        count: 5,
        steps: [
          {
            type: "step",
            id: "ec7f12a5-a033-4659-8417-5dca37a4117e",
            name: "Climbing Interval",
            instructions:
              "Notes:\nFind a good climb and push hard - aim for threshold power\n\nBlock context:\nSegment: bike activity\n\nInterval:\nInterval 2",
            duration: {
              type: "time",
              seconds: 360,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 95,
              },
            ],
          },
          {
            type: "step",
            id: "7dea57c4-319e-4b78-a552-2ec1089b7a0d",
            name: "Recovery Descent",
            instructions: "Notes:\nUse terrain to recover - easy spinning or coasting",
            duration: {
              type: "time",
              seconds: 240,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 45,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "5bc881ee-a714-4d3a-8330-68fb8e21b447",
        name: "Cool-down",
        instructions:
          "Notes:\nEasy spinning on flat terrain to recover\n\nBlock context:\nSegment: bike activity\n\nInterval:\nCool-down",
        duration: {
          type: "time",
          seconds: 900,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 50,
          },
        ],
      },
    ],
  },
  "2a5b6c7d-8e9f-4a1b-ac3d-4e5f6a7b8c9d": {
    version: 5,
    activity_category: "bike",
    items: [
      {
        type: "step",
        id: "1b8841ae-67d4-4dfa-83f0-a83bce61f487",
        name: "Group Warm-up",
        instructions:
          "Notes:\nConversational pace as group gets organized\n\nBlock context:\nSegment: bike activity\n\nInterval:\nGroup Warm-up",
        duration: {
          type: "time",
          seconds: 1200,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 60,
          },
        ],
      },
      {
        type: "repeat",
        id: "d946b320-2592-4f6c-b1de-c2559c2f7609",
        count: 8,
        steps: [
          {
            type: "step",
            id: "9a2d7407-4ee1-48bb-8295-a714cd3a5bc8",
            name: "Attack/Chase",
            instructions:
              "Notes:\nHard effort to simulate attacks or bridging gaps\n\nBlock context:\nSegment: bike activity\n\nInterval:\nInterval 2",
            duration: {
              type: "time",
              seconds: 120,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 100,
              },
            ],
          },
          {
            type: "step",
            id: "9f0cc532-53c0-49e6-b7a4-74079a2d28bb",
            name: "Group Tempo",
            instructions: "Notes:\nSteady pace as group settles after effort",
            duration: {
              type: "time",
              seconds: 180,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 75,
              },
            ],
          },
          {
            type: "step",
            id: "780b9e31-c457-4a7d-a073-e14ebb282d9a",
            name: "Easy Spinning",
            instructions: "Notes:\nEasy spinning in the bunch",
            duration: {
              type: "time",
              seconds: 120,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 55,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "59c633a0-a512-4fec-b15e-42d51caff689",
        name: "Sprint Finish",
        instructions:
          "Notes:\nGive your best effort over the full minute to simulate a group ride finish; maintain bike control rather than trying to hold peak sprint power throughout.\n\nBlock context:\nSegment: bike activity\n\nInterval:\nSprint Finish",
        duration: {
          type: "time",
          seconds: 60,
        },
        targets: [
          {
            type: "RPE",
            intensity: 10,
          },
        ],
      },
      {
        type: "step",
        id: "8013a639-cc5f-4285-98ab-1986f36065d2",
        name: "Cool-down Spin",
        instructions:
          "Notes:\nEasy spinning to cool down after efforts\n\nBlock context:\nSegment: bike activity\n\nInterval:\nCool-down Spin",
        duration: {
          type: "time",
          seconds: 840,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 50,
          },
        ],
      },
    ],
  },
  "6f2a4c8e-1b3d-4f6a-8c9e-2d4b6f8a1c3e": {
    version: 5,
    activity_category: "bike",
    items: [
      {
        type: "step",
        id: "c5329f0c-79e6-43c0-9dca-26b900937205",
        name: "Warmup",
        instructions:
          "Notes:\nStart relaxed and build cadence smoothly.\n\nBlock context:\nSegment: bike activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 900,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 60,
          },
        ],
      },
      {
        type: "step",
        id: "ae41881b-fa8d-4467-96a9-e35009762f9c",
        name: "Settled Endurance",
        instructions:
          "Notes:\nLock into conversational endurance riding.\n\nBlock context:\nSegment: bike activity\n\nInterval:\nSettled Endurance",
        duration: {
          type: "time",
          seconds: 3300,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 70,
          },
        ],
      },
      {
        type: "repeat",
        id: "ba4d9427-6e01-48db-a2b5-c734ed5a7be8",
        count: 2,
        steps: [
          {
            type: "step",
            id: "d744fd6a-8bf8-411e-bfac-9c2fc25550e3",
            name: "Tempo Lift",
            instructions:
              "Notes:\nRaise pressure without drifting above controlled tempo.\n\nBlock context:\nSegment: bike activity\n\nInterval:\nProgressive Lift",
            duration: {
              type: "time",
              seconds: 600,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 75,
              },
            ],
          },
          {
            type: "step",
            id: "ec7f12a5-a033-4659-8417-5dca37a4117e",
            name: "Easy Reset",
            instructions: "Notes:\nRecover while keeping pedals moving.",
            duration: {
              type: "time",
              seconds: 480,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 60,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "28bb4ee1-7407-4a2d-9023-d13eab181d8a",
        name: "Steady Finish",
        instructions:
          "Notes:\nFinish with durable aerobic pressure, not a fade.\n\nBlock context:\nSegment: bike activity\n\nInterval:\nSteady Finish",
        duration: {
          type: "time",
          seconds: 1500,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 70,
          },
        ],
      },
      {
        type: "step",
        id: "f966d340-45b2-4f8c-91fe-62f53ccf16a9",
        name: "Cooldown",
        instructions:
          "Notes:\nSpin out the legs before ending the ride.\n\nBlock context:\nSegment: bike activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 480,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 55,
          },
        ],
      },
    ],
  },
  "b1c00000-0003-4000-8001-000000000009": {
    version: 5,
    activity_category: "bike",
    items: [
      {
        type: "step",
        id: "ae41881b-fa8d-4467-96a9-e35009762f9c",
        name: "Warmup",
        instructions:
          "Notes:\nBuild cadence gradually and confirm that the intended target is appropriate today.\n\nBlock context:\nSegment: bike activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 660,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 55,
          },
        ],
      },
      {
        type: "repeat",
        id: "b84bde71-0497-4abd-a0b3-a10e7be8ed5a",
        count: 4,
        steps: [
          {
            type: "step",
            id: "1b8841ae-67d4-4dfa-83f0-a83bce61f487",
            name: "Work",
            instructions:
              "Notes:\nSettle quickly, keep cadence stable, and avoid power spikes at the start of each interval.\n\nBlock context:\nSegment: bike activity\n\nInterval:\nTempo Control Intervals",
            duration: {
              type: "time",
              seconds: 600,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 80,
              },
            ],
          },
          {
            type: "step",
            id: "9a2d7407-4ee1-48bb-8295-a714cd3a5bc8",
            name: "Recovery",
            instructions:
              "Notes:\nPedal easily until breathing and movement quality are ready for the next effort.",
            duration: {
              type: "time",
              seconds: 240,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 50,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "38cb5ef1-8417-4a3d-a033-218efb686dda",
        name: "Cooldown",
        instructions:
          "Notes:\nReduce pressure progressively and finish with relaxed, smooth pedaling.\n\nBlock context:\nSegment: bike activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 540,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 50,
          },
        ],
      },
    ],
  },
  "b1c00000-0004-4000-8001-000000000013": {
    version: 5,
    activity_category: "bike",
    items: [
      {
        type: "step",
        id: "46d920b3-9225-4cff-9e71-cb38f15e1784",
        name: "Warmup",
        instructions:
          "Notes:\nBuild cadence gradually and confirm that the intended target is appropriate today.\n\nBlock context:\nSegment: bike activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 660,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 55,
          },
        ],
      },
      {
        type: "repeat",
        id: "d063f689-1caf-42d5-a8fb-a91683f0f562",
        count: 4,
        steps: [
          {
            type: "step",
            id: "ef5c1582-a310-4936-87f4-04972abdb84b",
            name: "Work",
            instructions:
              "Notes:\nRide close to threshold with controlled breathing and repeatable power through the final interval.\n\nBlock context:\nSegment: bike activity\n\nInterval:\nThreshold Power Intervals",
            duration: {
              type: "time",
              seconds: 480,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 90,
              },
            ],
          },
          {
            type: "step",
            id: "da6db447-8e21-48fb-82d5-67d48dfa1b88",
            name: "Recovery",
            instructions:
              "Notes:\nPedal easily until breathing and movement quality are ready for the next effort.",
            duration: {
              type: "time",
              seconds: 240,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 50,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "50e37609-9c2f-4255-a87b-2996037075e2",
        name: "Cooldown",
        instructions:
          "Notes:\nReduce pressure progressively and finish with relaxed, smooth pedaling.\n\nBlock context:\nSegment: bike activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 540,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 50,
          },
        ],
      },
    ],
  },
  "b1c00000-0006-4000-8001-000000000021": {
    version: 5,
    activity_category: "bike",
    items: [
      {
        type: "step",
        id: "cb38f15e-1784-4daa-b3a0-982bbe51e477",
        name: "Warmup",
        instructions:
          "Notes:\nBuild cadence gradually and confirm that the intended target is appropriate today.\n\nBlock context:\nSegment: bike activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 660,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 55,
          },
        ],
      },
      {
        type: "repeat",
        id: "89f663d0-d542-4f1c-a18e-b2458c1f66f9",
        count: 4,
        steps: [
          {
            type: "step",
            id: "52e52cbf-0699-4073-aa7d-4fbc75e20370",
            name: "Work",
            instructions:
              "Notes:\nAccelerate decisively, then hold form and torque without fading through the final seconds.\n\nBlock context:\nSegment: bike activity\n\nInterval:\nAnaerobic Repeatability",
            duration: {
              type: "time",
              seconds: 90,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 110,
              },
            ],
          },
          {
            type: "step",
            id: "ef5c1582-a310-4936-87f4-04972abdb84b",
            name: "Recovery",
            instructions:
              "Notes:\nPedal easily until breathing and movement quality are ready for the next effort.",
            duration: {
              type: "time",
              seconds: 180,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 50,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "0976e350-55c2-4f9c-a10e-32c50c9fe679",
        name: "Cooldown",
        instructions:
          "Notes:\nReduce pressure progressively and finish with relaxed, smooth pedaling.\n\nBlock context:\nSegment: bike activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 540,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 50,
          },
        ],
      },
    ],
  },
  "b1c00000-0007-4000-8001-000000000025": {
    version: 5,
    activity_category: "bike",
    items: [
      {
        type: "step",
        id: "70039629-bc4f-4275-889b-49b623909502",
        name: "Warmup",
        instructions:
          "Notes:\nBuild cadence gradually and confirm that the intended target is appropriate today.\n\nBlock context:\nSegment: bike activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 660,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 55,
          },
        ],
      },
      {
        type: "repeat",
        id: "f285cc5f-a639-4013-8a1d-ef5c1582a310",
        count: 4,
        steps: [
          {
            type: "step",
            id: "79e653c0-c532-4f0c-917e-e275bc4f9629",
            name: "Work",
            instructions:
              "Notes:\nSprint with excellent posture and fast force production; stop if power or technique deteriorates.\n\nBlock context:\nSegment: bike activity\n\nInterval:\nNeuromuscular Sprint Set",
            duration: {
              type: "time",
              seconds: 15,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 125,
              },
            ],
          },
          {
            type: "step",
            id: "e4770a9d-982b-4e51-8cdf-c5329f0c79e6",
            name: "Recovery",
            instructions:
              "Notes:\nPedal easily until breathing and movement quality are ready for the next effort.",
            duration: {
              type: "time",
              seconds: 225,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 50,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "72054cdf-26b9-4093-8a9d-6fdc95022390",
        name: "Cooldown",
        instructions:
          "Notes:\nReduce pressure progressively and finish with relaxed, smooth pedaling.\n\nBlock context:\nSegment: bike activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 540,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 50,
          },
        ],
      },
    ],
  },
  "b1c00000-0008-4000-8001-000000000029": {
    version: 5,
    activity_category: "bike",
    items: [
      {
        type: "step",
        id: "861960f3-d265-4c3f-9eb1-8bf8b11ed744",
        name: "Warmup",
        instructions:
          "Notes:\nBuild cadence gradually and confirm that the intended target is appropriate today.\n\nBlock context:\nSegment: bike activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 660,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 55,
          },
        ],
      },
      {
        type: "repeat",
        id: "7c0fa235-30c3-46e9-94a7-2d9a0774e14e",
        count: 4,
        steps: [
          {
            type: "step",
            id: "07742d9a-bb28-414e-afdc-0c9f32c5c053",
            name: "Work",
            instructions:
              "Notes:\nHold a smooth, even pedal stroke while maintaining aerobic pressure.\n\nBlock context:\nSegment: bike activity\n\nInterval:\nCadence Endurance Blocks",
            duration: {
              type: "time",
              seconds: 480,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 70,
              },
              {
                type: "cadence",
                intensity: 90,
              },
            ],
          },
          {
            type: "step",
            id: "ba4d9427-6e01-48db-a2b5-c734ed5a7be8",
            name: "Recovery",
            instructions:
              "Notes:\nPedal easily until breathing and movement quality are ready for the next effort.",
            duration: {
              type: "time",
              seconds: 180,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 50,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "fc8f22b5-b043-4669-9427-ad1a87f461ce",
        name: "Cooldown",
        instructions:
          "Notes:\nReduce pressure progressively and finish with relaxed, smooth pedaling.\n\nBlock context:\nSegment: bike activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 540,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 50,
          },
        ],
      },
    ],
  },
  "c1a00000-0003-4000-8001-000000000009": {
    version: 5,
    activity_category: "run",
    items: [
      {
        type: "step",
        id: "dc6f0295-9023-4649-b407-8dfa67d441ae",
        name: "Warmup",
        instructions:
          "Notes:\nJog easily and include mobility drills before faster running.\n\nBlock context:\nSegment: run activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 720,
        },
        targets: [
          {
            type: "RPE",
            intensity: 3,
          },
        ],
      },
      {
        type: "repeat",
        id: "1aadf487-ce61-483b-8215-27944dbadb48",
        count: 4,
        steps: [
          {
            type: "step",
            id: "9b08c12e-e754-4d7a-8370-28bb4ee17407",
            name: "Work",
            instructions:
              "Notes:\nControlled tempo repetitions that develop sustainable speed below threshold strain. Run tall and controlled; preserve the same mechanics through every repetition.\n\nBlock context:\nSegment: run activity\n\nInterval:\nCruise Tempo Run",
            duration: {
              type: "time",
              seconds: 510,
            },
            targets: [
              {
                type: "RPE",
                intensity: 6,
              },
            ],
          },
          {
            type: "step",
            id: "089b2ec1-54e7-4a0d-b003-319e0b787dea",
            name: "Recovery",
            instructions:
              "Notes:\nJog very easily throughout recovery; keep it conversational rather than turning it into another tempo effort.",
            duration: {
              type: "time",
              seconds: 170,
            },
            targets: [
              {
                type: "RPE",
                intensity: 2,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "9a2d7407-4ee1-48bb-8295-a714cd3a5bc8",
        name: "Cooldown",
        instructions:
          "Notes:\nJog easily, then walk until breathing settles.\n\nBlock context:\nSegment: run activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  "c1a00000-0006-4000-8001-000000000021": {
    version: 5,
    activity_category: "run",
    items: [
      {
        type: "step",
        id: "a91683f0-f562-4f3c-81ae-d265ac3f8619",
        name: "Warmup",
        instructions:
          "Notes:\nJog easily and include mobility drills before faster running.\n\nBlock context:\nSegment: run activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 720,
        },
        targets: [
          {
            type: "RPE",
            intensity: 3,
          },
        ],
      },
      {
        type: "repeat",
        id: "cb38f15e-1784-4daa-b3a0-982bbe51e477",
        count: 4,
        steps: [
          {
            type: "step",
            id: "9e31780b-ea7d-4457-8699-9300b926df4c",
            name: "Work",
            instructions:
              "Notes:\nShort hill surges that develop repeatable anaerobic power with full form-focused recovery. Run tall and controlled; preserve the same mechanics through every repetition.\n\nBlock context:\nSegment: run activity\n\nInterval:\nAnaerobic Hill Surges",
            duration: {
              type: "time",
              seconds: 45,
            },
            targets: [
              {
                type: "RPE",
                intensity: 9,
              },
            ],
          },
          {
            type: "step",
            id: "9d0a77e4-51be-4b98-8572-4ee128bb9a2d",
            name: "Recovery",
            instructions:
              "Notes:\nWalk or jog gently downhill. Start the next surge only with controlled breathing and stable form; extend recovery if needed.",
            duration: {
              type: "time",
              seconds: 125,
            },
            targets: [
              {
                type: "RPE",
                intensity: 2,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "4bb871de-9704-4d2a-b320-18ab3ed164f7",
        name: "Cooldown",
        instructions:
          "Notes:\nJog easily, then walk until breathing settles.\n\nBlock context:\nSegment: run activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  "c1a00000-0007-4000-8001-000000000025": {
    version: 5,
    activity_category: "run",
    items: [
      {
        type: "step",
        id: "26b90093-7205-4cdf-be51-ab18d13ef764",
        name: "Warmup",
        instructions:
          "Notes:\nJog easily and include mobility drills before faster running.\n\nBlock context:\nSegment: run activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 720,
        },
        targets: [
          {
            type: "RPE",
            intensity: 3,
          },
        ],
      },
      {
        type: "repeat",
        id: "e0730699-2cbf-42e5-b80b-79e653c0c532",
        count: 4,
        steps: [
          {
            type: "step",
            id: "dd4ab724-91fe-4bd8-85b2-0ea1e87b5aed",
            name: "Work",
            instructions:
              "Notes:\nBrief relaxed strides that sharpen coordination and leg speed without accumulating lactate. Run tall and controlled; preserve the same mechanics through every repetition.\n\nBlock context:\nSegment: run activity\n\nInterval:\nNeuromuscular Strides",
            duration: {
              type: "time",
              seconds: 20,
            },
            targets: [
              {
                type: "RPE",
                intensity: 9,
              },
            ],
          },
          {
            type: "step",
            id: "52e52cbf-0699-4073-aa7d-4fbc75e20370",
            name: "Recovery",
            instructions:
              "Notes:\nWalk or jog very easily until breathing settles. Keep each stride relaxed and quick; extend recovery rather than sprinting fatigued.",
            duration: {
              type: "time",
              seconds: 90,
            },
            targets: [
              {
                type: "RPE",
                intensity: 2,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "60f38619-ac3f-4265-b88b-f966d34045b2",
        name: "Cooldown",
        instructions:
          "Notes:\nJog easily, then walk until breathing settles.\n\nBlock context:\nSegment: run activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  "d1a00000-0001-4000-8001-000000000001": {
    version: 5,
    activity_category: "swim",
    items: [
      {
        type: "step",
        id: "ef5c1582-a310-4936-87f4-04972abdb84b",
        name: "Warmup",
        instructions:
          "Notes:\nSwim easy freestyle; use catch-up drill for the first 50 m, then settle into a long, relaxed stroke.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nWarmup",
        duration: {
          type: "distance",
          meters: 350,
        },
        targets: [
          {
            type: "RPE",
            intensity: 3,
          },
        ],
      },
      {
        type: "repeat",
        id: "91fe6bd8-dd4a-4724-b966-4add24b7fe91",
        count: 4,
        steps: [
          {
            type: "step",
            id: "f285cc5f-a639-4013-8a1d-ef5c1582a310",
            name: "Work",
            instructions:
              "Notes:\nEasy swimming that restores feel for the water and relaxed alignment. Hold the prescribed effort only while stroke length and breathing remain controlled.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nRecovery Feel Swim",
            duration: {
              type: "distance",
              meters: 200,
            },
            targets: [
              {
                type: "RPE",
                intensity: 3,
              },
            ],
          },
          {
            type: "step",
            id: "53c079e6-9f0c-4532-ab58-d063f6891caf",
            name: "Recovery",
            instructions:
              "Notes:\nRest at the wall; start the next repeat with calm breathing and deliberate form.",
            duration: {
              type: "time",
              seconds: 15,
            },
            targets: [
              {
                type: "rest",
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "117eeb58-5dca-47a4-b9e6-ca5da4377e11",
        name: "Cooldown",
        instructions:
          "Notes:\nSwim down easily and finish before technique degrades.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nCooldown",
        duration: {
          type: "distance",
          meters: 250,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  "d1a00000-0002-4000-8001-000000000005": {
    version: 5,
    activity_category: "swim",
    items: [
      {
        type: "step",
        id: "2d9a0774-e14e-4b28-9502-9e31780bea7d",
        name: "Warmup",
        instructions:
          "Notes:\nSwim easy freestyle; use catch-up drill for the first 50 m, then settle into a long, relaxed stroke.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nWarmup",
        duration: {
          type: "distance",
          meters: 350,
        },
        targets: [
          {
            type: "RPE",
            intensity: 3,
          },
        ],
      },
      {
        type: "repeat",
        id: "e3500976-2f9c-45c2-bbe8-20b346d96cff",
        count: 4,
        steps: [
          {
            type: "step",
            id: "66f940d3-b245-4c1f-be91-6bd891feb724",
            name: "Work",
            instructions:
              "Notes:\nContinuous aerobic repeats that develop economical, repeatable freestyle. Hold the prescribed effort only while stroke length and breathing remain controlled.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nAerobic Continuity Swim",
            duration: {
              type: "distance",
              meters: 400,
            },
            targets: [
              {
                type: "RPE",
                intensity: 5,
              },
            ],
          },
          {
            type: "step",
            id: "e956c330-35a2-4f7c-81ee-92256cff46d9",
            name: "Recovery",
            instructions:
              "Notes:\nRest at the wall; start the next repeat with calm breathing and deliberate form.",
            duration: {
              type: "time",
              seconds: 25,
            },
            targets: [
              {
                type: "rest",
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "63d089f6-af1c-4542-bb68-a033c659ec7f",
        name: "Cooldown",
        instructions:
          "Notes:\nSwim down easily and finish before technique degrades.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nCooldown",
        duration: {
          type: "distance",
          meters: 250,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  "d1a00000-0003-4000-8001-000000000009": {
    version: 5,
    activity_category: "swim",
    items: [
      {
        type: "step",
        id: "fe91d86b-4add-44b7-a6f9-73e09906bf2c",
        name: "Warmup",
        instructions:
          "Notes:\nSwim easy freestyle; use catch-up drill for the first 50 m, then settle into a long, relaxed stroke.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nWarmup",
        duration: {
          type: "distance",
          meters: 350,
        },
        targets: [
          {
            type: "RPE",
            intensity: 3,
          },
        ],
      },
      {
        type: "repeat",
        id: "70039629-bc4f-4275-889b-49b623909502",
        count: 4,
        steps: [
          {
            type: "step",
            id: "49b62390-9502-4fdc-a14e-f285cc5fa639",
            name: "Work",
            instructions:
              "Notes:\nControlled pull buoy tempo repeats that reinforce a firm catch and steady pressure. Hold the prescribed effort only while stroke length and breathing remain controlled.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nTempo Pull Set",
            duration: {
              type: "distance",
              meters: 200,
            },
            targets: [
              {
                type: "RPE",
                intensity: 6,
              },
            ],
          },
          {
            type: "step",
            id: "82155cef-36c9-40a3-9aad-3fac65d2f360",
            name: "Recovery",
            instructions:
              "Notes:\nRest at the wall; start the next repeat with calm breathing and deliberate form.",
            duration: {
              type: "time",
              seconds: 20,
            },
            targets: [
              {
                type: "rest",
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "f08316a9-3ccf-42f5-881b-c936a3101582",
        name: "Cooldown",
        instructions:
          "Notes:\nSwim down easily and finish before technique degrades.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nCooldown",
        duration: {
          type: "distance",
          meters: 250,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  "d1a00000-0004-4000-8001-000000000013": {
    version: 5,
    activity_category: "swim",
    items: [
      {
        type: "step",
        id: "d467fa8d-881b-4e41-bccf-f562cf3ca916",
        name: "Warmup",
        instructions:
          "Notes:\nSwim easy freestyle; use catch-up drill for the first 50 m, then settle into a long, relaxed stroke.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nWarmup",
        duration: {
          type: "distance",
          meters: 350,
        },
        targets: [
          {
            type: "RPE",
            intensity: 3,
          },
        ],
      },
      {
        type: "repeat",
        id: "b6499023-0295-4c6f-8ee1-7be8a10ec734",
        count: 4,
        steps: [
          {
            type: "step",
            id: "e956c330-35a2-4f7c-81ee-92256cff46d9",
            name: "Work",
            instructions:
              "Notes:\nCritical swim speed repeats that improve sustainable race-pace control. Hold the prescribed effort only while stroke length and breathing remain controlled.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nCSS Threshold Swim",
            duration: {
              type: "distance",
              meters: 150,
            },
            targets: [
              {
                type: "RPE",
                intensity: 7,
              },
            ],
          },
          {
            type: "step",
            id: "e0730699-2cbf-42e5-b80b-79e653c0c532",
            name: "Recovery",
            instructions:
              "Notes:\nRest at the wall; start the next repeat with calm breathing and deliberate form.",
            duration: {
              type: "time",
              seconds: 20,
            },
            targets: [
              {
                type: "rest",
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "36c910a3-8215-4cef-8e61-fb68218e47b4",
        name: "Cooldown",
        instructions:
          "Notes:\nSwim down easily and finish before technique degrades.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nCooldown",
        duration: {
          type: "distance",
          meters: 250,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  "d1a00000-0005-4000-8001-000000000017": {
    version: 5,
    activity_category: "swim",
    items: [
      {
        type: "step",
        id: "16a9f083-62f5-4ccf-ae41-db48016e2794",
        name: "Warmup",
        instructions:
          "Notes:\nSwim easy freestyle; use catch-up drill for the first 50 m, then settle into a long, relaxed stroke.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nWarmup",
        duration: {
          type: "distance",
          meters: 350,
        },
        targets: [
          {
            type: "RPE",
            intensity: 3,
          },
        ],
      },
      {
        type: "repeat",
        id: "9427ba4d-48db-4e01-bc8f-35a20f7ce956",
        count: 4,
        steps: [
          {
            type: "step",
            id: "dd4ab724-91fe-4bd8-85b2-0ea1e87b5aed",
            name: "Work",
            instructions:
              "Notes:\nHard 100-metre repeats that raise aerobic power while preserving stroke length. Hold the prescribed effort only while stroke length and breathing remain controlled.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nVO2 Pace Swim",
            duration: {
              type: "distance",
              meters: 100,
            },
            targets: [
              {
                type: "RPE",
                intensity: 8,
              },
            ],
          },
          {
            type: "step",
            id: "aa3d8417-5ef1-48cb-92a5-77e49d0a2b98",
            name: "Recovery",
            instructions:
              "Notes:\nRest at the wall; start the next repeat with calm breathing and deliberate form.",
            duration: {
              type: "time",
              seconds: 30,
            },
            targets: [
              {
                type: "rest",
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "14a73acd-c85b-4e81-bc0f-b5228ffc69d6",
        name: "Cooldown",
        instructions:
          "Notes:\nSwim down easily and finish before technique degrades.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nCooldown",
        duration: {
          type: "distance",
          meters: 250,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  "d1a00000-0006-4000-8001-000000000021": {
    version: 5,
    activity_category: "swim",
    items: [
      {
        type: "step",
        id: "36c910a3-8215-4cef-8e61-fb68218e47b4",
        name: "Warmup",
        instructions:
          "Notes:\nSwim easy freestyle; use catch-up drill for the first 50 m, then settle into a long, relaxed stroke.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nWarmup",
        duration: {
          type: "distance",
          meters: 350,
        },
        targets: [
          {
            type: "RPE",
            intensity: 3,
          },
        ],
      },
      {
        type: "repeat",
        id: "c85bee81-14a7-4acd-b0c3-71de4bb8bd2a",
        count: 4,
        steps: [
          {
            type: "step",
            id: "e3500976-2f9c-45c2-bbe8-20b346d96cff",
            name: "Work",
            instructions:
              "Notes:\nShort 50-metre efforts that develop repeatable speed with enough rest to protect technique. Hold the prescribed effort only while stroke length and breathing remain controlled.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nAnaerobic 50s",
            duration: {
              type: "distance",
              meters: 50,
            },
            targets: [
              {
                type: "RPE",
                intensity: 9,
              },
            ],
          },
          {
            type: "step",
            id: "6afd44d7-1eb1-488b-9265-b724dd4a6bd8",
            name: "Recovery",
            instructions:
              "Notes:\nRest at the wall; start the next repeat with calm breathing and deliberate form.",
            duration: {
              type: "time",
              seconds: 70,
            },
            targets: [
              {
                type: "rest",
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "48db6e01-9427-4a4d-b043-f15ecb383daa",
        name: "Cooldown",
        instructions:
          "Notes:\nSwim down easily and finish before technique degrades.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nCooldown",
        duration: {
          type: "distance",
          meters: 250,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  "d1a00000-0007-4000-8001-000000000025": {
    version: 5,
    activity_category: "swim",
    items: [
      {
        type: "step",
        id: "bb28e14e-0774-4d9a-a390-c85bee8114a7",
        name: "Warmup",
        instructions:
          "Notes:\nSwim easy freestyle; use catch-up drill for the first 50 m, then settle into a long, relaxed stroke.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nWarmup",
        duration: {
          type: "distance",
          meters: 350,
        },
        targets: [
          {
            type: "RPE",
            intensity: 3,
          },
        ],
      },
      {
        type: "repeat",
        id: "d542af1c-89f6-43d0-adda-760950e3c255",
        count: 4,
        steps: [
          {
            type: "step",
            id: "d669b043-22b5-4c8f-ae01-1b8841ae67d4",
            name: "Work",
            instructions:
              "Notes:\nBrief 25-metre accelerations that sharpen stroke timing with complete quality recovery. Hold the prescribed effort only while stroke length and breathing remain controlled.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nNeuromuscular 25s",
            duration: {
              type: "distance",
              meters: 25,
            },
            targets: [
              {
                type: "RPE",
                intensity: 9,
              },
            ],
          },
          {
            type: "step",
            id: "77e49d0a-2b98-41be-9f4c-bc4fe2757003",
            name: "Recovery",
            instructions:
              "Notes:\nRest at the wall; start the next repeat with calm breathing and deliberate form.",
            duration: {
              type: "time",
              seconds: 85,
            },
            targets: [
              {
                type: "rest",
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "55c22f9c-0976-4350-ad5a-f689d06342d5",
        name: "Cooldown",
        instructions:
          "Notes:\nSwim down easily and finish before technique degrades.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nCooldown",
        duration: {
          type: "distance",
          meters: 250,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  "d1a00000-0008-4000-8001-000000000029": {
    version: 5,
    activity_category: "swim",
    items: [
      {
        type: "step",
        id: "f08316a9-3ccf-42f5-881b-c936a3101582",
        name: "Warmup",
        instructions:
          "Notes:\nSwim easy freestyle; use catch-up drill for the first 50 m, then settle into a long, relaxed stroke.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nWarmup",
        duration: {
          type: "distance",
          meters: 350,
        },
        targets: [
          {
            type: "RPE",
            intensity: 3,
          },
        ],
      },
      {
        type: "repeat",
        id: "4ee128bb-9a2d-4407-b649-037029964fbc",
        count: 4,
        steps: [
          {
            type: "step",
            id: "43b069d6-8ffc-4522-9b48-8013a639cc5f",
            name: "Work",
            instructions:
              "Notes:\nAerobic freestyle repeats that rehearse lifting the eyes forward every six to eight strokes without breaking body line. Hold the prescribed effort only while stroke length and breathing remain controlled.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nSighting Endurance Swim",
            duration: {
              type: "distance",
              meters: 300,
            },
            targets: [
              {
                type: "RPE",
                intensity: 5,
              },
            ],
          },
          {
            type: "step",
            id: "fc8f22b5-b043-4669-9427-ad1a87f461ce",
            name: "Recovery",
            instructions:
              "Notes:\nRest at the wall; start the next repeat with calm breathing and deliberate form.",
            duration: {
              type: "time",
              seconds: 20,
            },
            targets: [
              {
                type: "rest",
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "ce61a83b-1aad-4487-b6c9-83f0a916cf3c",
        name: "Cooldown",
        instructions:
          "Notes:\nSwim down easily and finish before technique degrades.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nCooldown",
        duration: {
          type: "distance",
          meters: 250,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  "d1a00000-0009-4000-8001-000000000033": {
    version: 5,
    activity_category: "swim",
    items: [
      {
        type: "step",
        id: "53c079e6-9f0c-4532-ab58-d063f6891caf",
        name: "Warmup",
        instructions:
          "Notes:\nSwim easy freestyle; use catch-up drill for the first 50 m, then settle into a long, relaxed stroke.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nWarmup",
        duration: {
          type: "distance",
          meters: 350,
        },
        targets: [
          {
            type: "RPE",
            intensity: 3,
          },
        ],
      },
      {
        type: "repeat",
        id: "0d7ae754-c12e-4b08-b5e2-7e1158ebca5d",
        count: 4,
        steps: [
          {
            type: "step",
            id: "30c356e9-7c0f-4235-885b-89f663d0d542",
            name: "Work",
            instructions:
              "Notes:\nTempo repeats that finish faster than they begin, teaching controlled pressure and a patient first half. Hold the prescribed effort only while stroke length and breathing remain controlled.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nTempo Negative-Split Swim",
            duration: {
              type: "distance",
              meters: 250,
            },
            targets: [
              {
                type: "RPE",
                intensity: 6,
              },
            ],
          },
          {
            type: "step",
            id: "87f4ad1a-3ba8-41ce-af5c-8c1fb24540d3",
            name: "Recovery",
            instructions:
              "Notes:\nRest at the wall; start the next repeat with calm breathing and deliberate form.",
            duration: {
              type: "time",
              seconds: 25,
            },
            targets: [
              {
                type: "rest",
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "8dfa67d4-41ae-4b88-b562-fe91d86b4add",
        name: "Cooldown",
        instructions:
          "Notes:\nSwim down easily and finish before technique degrades.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nCooldown",
        duration: {
          type: "distance",
          meters: 250,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  "e2a00000-0001-4000-8001-000000000001": {
    version: 5,
    activity_category: "strength",
    items: [
      {
        type: "step",
        id: "d13eab18-1d8a-4764-b9a6-0a9de477be51",
        name: "Warmup",
        instructions:
          "Notes:\nUse joint circles, bodyweight rehearsal, and one lighter practice set before loading.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 420,
        },
        targets: [
          {
            type: "RPE",
            intensity: 3,
          },
        ],
      },
      {
        type: "repeat",
        id: "b724dd4a-6bd8-41fe-9f8c-7c0fa23530c3",
        count: 3,
        steps: [
          {
            type: "step",
            id: "ac3fd265-60f3-4619-84d7-9d0a77e451be",
            name: "Goblet Squat",
            instructions:
              "Notes:\nUse a load that permits a controlled descent and stable foot pressure.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nGoblet Squat",
            duration: {
              type: "repetitions",
              count: 10,
            },
            targets: [
              {
                type: "RPE",
                intensity: 5,
              },
            ],
          },
          {
            type: "step",
            id: "5dca37a4-117e-4b58-8532-8e2168fbda6d",
            name: "Rest",
            instructions: "Notes:\nRecover fully enough to repeat precise movement.",
            duration: {
              type: "time",
              seconds: 45,
            },
            targets: [
              {
                type: "rest",
              },
            ],
          },
        ],
      },
      {
        type: "repeat",
        id: "9023b649-dc6f-4295-a8bb-e956c33035a2",
        count: 3,
        steps: [
          {
            type: "step",
            id: "37a45dca-eb58-417e-9f0c-fc8f22b5b043",
            name: "Romanian Deadlift",
            instructions:
              "Notes:\nKeep ribs stacked and stop a set if range or balance changes.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nRomanian Deadlift",
            duration: {
              type: "repetitions",
              count: 10,
            },
            targets: [
              {
                type: "RPE",
                intensity: 5,
              },
            ],
          },
          {
            type: "step",
            id: "66f940d3-b245-4c1f-be91-6bd891feb724",
            name: "Rest",
            instructions: "Notes:\nRecover fully enough to repeat precise movement.",
            duration: {
              type: "time",
              seconds: 45,
            },
            targets: [
              {
                type: "rest",
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "4add24b7-fe91-486b-b245-17843daacb38",
        name: "Cooldown",
        instructions:
          "Notes:\nWalk briefly, then use comfortable range-of-motion work for the trained areas.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 300,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  "e2a00000-0002-4000-8001-000000000005": {
    version: 5,
    activity_category: "strength",
    items: [
      {
        type: "step",
        id: "44d76afd-f88b-4eb1-ac3f-a5127fec59c6",
        name: "Warmup",
        instructions:
          "Notes:\nUse joint circles, bodyweight rehearsal, and one lighter practice set before loading.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 420,
        },
        targets: [
          {
            type: "RPE",
            intensity: 3,
          },
        ],
      },
      {
        type: "repeat",
        id: "fe91d86b-4add-44b7-a6f9-73e09906bf2c",
        count: 3,
        steps: [
          {
            type: "step",
            id: "85f25fcc-39a6-4380-9d8a-66f940d3b245",
            name: "Front Squat",
            instructions:
              "Notes:\nChoose a load that leaves about two clean reps in reserve; do not grind the final rep.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nFront Squat",
            duration: {
              type: "repetitions",
              count: 5,
            },
            targets: [
              {
                type: "RPE",
                intensity: 8,
              },
            ],
          },
          {
            type: "step",
            id: "9023b649-dc6f-4295-a8bb-e956c33035a2",
            name: "Rest",
            instructions: "Notes:\nRecover fully enough to repeat precise movement.",
            duration: {
              type: "time",
              seconds: 180,
            },
            targets: [
              {
                type: "rest",
              },
            ],
          },
        ],
      },
      {
        type: "repeat",
        id: "49b62390-9502-4fdc-a14e-f285cc5fa639",
        count: 3,
        steps: [
          {
            type: "step",
            id: "7e1158eb-ca5d-4437-a679-f36019863fac",
            name: "Trap-Bar Deadlift",
            instructions:
              "Notes:\nLeave about two clean reps in reserve; reset your brace between repetitions.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nTrap-Bar Deadlift",
            duration: {
              type: "repetitions",
              count: 5,
            },
            targets: [
              {
                type: "RPE",
                intensity: 8,
              },
            ],
          },
          {
            type: "step",
            id: "239049b6-6fdc-4502-bb28-e07306992cbf",
            name: "Rest",
            instructions: "Notes:\nRecover fully enough to repeat precise movement.",
            duration: {
              type: "time",
              seconds: 180,
            },
            targets: [
              {
                type: "rest",
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "c734ed5a-7be8-410e-af9c-4cdf72050093",
        name: "Cooldown",
        instructions:
          "Notes:\nWalk briefly, then use comfortable range-of-motion work for the trained areas.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 300,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  "e2a00000-0003-4000-8001-000000000009": {
    version: 5,
    activity_category: "strength",
    items: [
      {
        type: "step",
        id: "0295dc6f-b649-4023-9a2d-bf2ce55273e0",
        name: "Warmup",
        instructions:
          "Notes:\nUse joint circles, bodyweight rehearsal, and one lighter practice set before loading.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 420,
        },
        targets: [
          {
            type: "RPE",
            intensity: 3,
          },
        ],
      },
      {
        type: "repeat",
        id: "2cbf52e5-e073-4699-8457-1d8af764d13e",
        count: 3,
        steps: [
          {
            type: "step",
            id: "a10e7be8-ed5a-4734-8976-9a2d74074ee1",
            name: "Rear-Foot Elevated Split Squat",
            instructions:
              "Notes:\nUse support if needed; keep the working knee tracking over the middle toes.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nRear-Foot Elevated Split Squat",
            duration: {
              type: "repetitions",
              count: 8,
            },
            targets: [
              {
                type: "RPE",
                intensity: 6,
              },
            ],
          },
          {
            type: "step",
            id: "0699e073-52e5-4cbf-9e31-0b78319e57c4",
            name: "Rest",
            instructions: "Notes:\nRecover fully enough to repeat precise movement.",
            duration: {
              type: "time",
              seconds: 75,
            },
            targets: [
              {
                type: "rest",
              },
            ],
          },
        ],
      },
      {
        type: "repeat",
        id: "bd2a9704-71de-4bb8-a592-ee81c85b3acd",
        count: 3,
        steps: [
          {
            type: "step",
            id: "ac3fd265-60f3-4619-84d7-9d0a77e451be",
            name: "Single-Leg Romanian Deadlift",
            instructions:
              "Notes:\nMove slowly enough to keep the pelvis level on every repetition.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nSingle-Leg Romanian Deadlift",
            duration: {
              type: "repetitions",
              count: 8,
            },
            targets: [
              {
                type: "RPE",
                intensity: 6,
              },
            ],
          },
          {
            type: "step",
            id: "f7641d8a-ab18-413e-9fcc-3ccf62f5f083",
            name: "Rest",
            instructions: "Notes:\nRecover fully enough to repeat precise movement.",
            duration: {
              type: "time",
              seconds: 75,
            },
            targets: [
              {
                type: "rest",
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "43b069d6-8ffc-4522-9b48-8013a639cc5f",
        name: "Cooldown",
        instructions:
          "Notes:\nWalk briefly, then use comfortable range-of-motion work for the trained areas.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 300,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  "e2a00000-0004-4000-8001-000000000013": {
    version: 5,
    activity_category: "strength",
    items: [
      {
        type: "step",
        id: "a437ca5d-58eb-4e11-8c9f-0572df4cb926",
        name: "Warmup",
        instructions:
          "Notes:\nUse joint circles, bodyweight rehearsal, and one lighter practice set before loading.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 420,
        },
        targets: [
          {
            type: "RPE",
            intensity: 3,
          },
        ],
      },
      {
        type: "repeat",
        id: "ea7dc457-9e31-480b-92e5-37a45dcaeb58",
        count: 3,
        steps: [
          {
            type: "step",
            id: "eb58117e-37a4-4dca-93c0-b84bde710497",
            name: "Kettlebell Swing",
            instructions:
              "Notes:\nUse a light, familiar load and end the set before speed declines.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nKettlebell Swing",
            duration: {
              type: "repetitions",
              count: 6,
            },
            targets: [
              {
                type: "RPE",
                intensity: 6,
              },
            ],
          },
          {
            type: "step",
            id: "28bb4ee1-7407-4a2d-9023-d13eab181d8a",
            name: "Rest",
            instructions: "Notes:\nRecover fully enough to repeat precise movement.",
            duration: {
              type: "time",
              seconds: 180,
            },
            targets: [
              {
                type: "rest",
              },
            ],
          },
        ],
      },
      {
        type: "repeat",
        id: "17843daa-cb38-415e-bfec-5cef821510a3",
        count: 3,
        steps: [
          {
            type: "step",
            id: "6afd44d7-1eb1-488b-9265-b724dd4a6bd8",
            name: "Low Box Step-Up Drive",
            instructions:
              "Notes:\nStep down under control; replace the drive with a low step-up if landing is noisy.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nLow Box Step-Up Drive",
            duration: {
              type: "repetitions",
              count: 6,
            },
            targets: [
              {
                type: "RPE",
                intensity: 6,
              },
            ],
          },
          {
            type: "step",
            id: "85f25fcc-39a6-4380-9d8a-66f940d3b245",
            name: "Rest",
            instructions: "Notes:\nRecover fully enough to repeat precise movement.",
            duration: {
              type: "time",
              seconds: 180,
            },
            targets: [
              {
                type: "rest",
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "51be2b98-9d0a-47e4-b926-8a1d64f73ed1",
        name: "Cooldown",
        instructions:
          "Notes:\nWalk briefly, then use comfortable range-of-motion work for the trained areas.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 300,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  "e2a00000-0005-4000-8001-000000000017": {
    version: 5,
    activity_category: "strength",
    items: [
      {
        type: "step",
        id: "a10e7be8-ed5a-4734-8976-9a2d74074ee1",
        name: "Warmup",
        instructions:
          "Notes:\nUse joint circles, bodyweight rehearsal, and one lighter practice set before loading.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 420,
        },
        targets: [
          {
            type: "RPE",
            intensity: 3,
          },
        ],
      },
      {
        type: "repeat",
        id: "9f0cc532-53c0-49e6-b7a4-74079a2d28bb",
        count: 3,
        steps: [
          {
            type: "step",
            id: "58eb7e11-a437-4a5d-8053-c12e9b080d7a",
            name: "Farmer Carry",
            instructions:
              "Notes:\nWalk tall with quiet steps; reduce load before grip or posture fails.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nFarmer Carry",
            duration: {
              type: "time",
              seconds: 30,
            },
            targets: [
              {
                type: "RPE",
                intensity: 6,
              },
            ],
          },
          {
            type: "step",
            id: "2592ff6c-d946-4320-bd2a-0699e07352e5",
            name: "Rest",
            instructions: "Notes:\nRecover fully enough to repeat precise movement.",
            duration: {
              type: "time",
              seconds: 60,
            },
            targets: [
              {
                type: "rest",
              },
            ],
          },
        ],
      },
      {
        type: "repeat",
        id: "54e77a0d-089b-4ec1-bc4f-75e24fbc2996",
        count: 3,
        steps: [
          {
            type: "step",
            id: "1f8c45b2-d340-4966-b724-f4871aada83b",
            name: "Half-Kneeling Pallof Press",
            instructions:
              "Notes:\nKeep hips and ribs square rather than twisting toward the band.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nHalf-Kneeling Pallof Press",
            duration: {
              type: "repetitions",
              count: 10,
            },
            targets: [
              {
                type: "RPE",
                intensity: 6,
              },
            ],
          },
          {
            type: "step",
            id: "5aed34c7-0ea1-487b-8255-e7540d7a9b08",
            name: "Rest",
            instructions: "Notes:\nRecover fully enough to repeat precise movement.",
            duration: {
              type: "time",
              seconds: 60,
            },
            targets: [
              {
                type: "rest",
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "96297003-e275-4c4f-aec1-5bc881eea714",
        name: "Cooldown",
        instructions:
          "Notes:\nWalk briefly, then use comfortable range-of-motion work for the trained areas.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 300,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  "f2a00000-0001-4000-8001-000000000001": {
    version: 5,
    activity_category: "other",
    items: [
      {
        type: "step",
        id: "b84bde71-0497-4abd-a0b3-a10e7be8ed5a",
        name: "Warmup",
        instructions:
          "Notes:\nBegin easily and check that movement feels comfortable today.\n\nBlock context:\nSegment: other activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 360,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
      {
        type: "step",
        id: "c330e956-0f7c-45a2-9bc8-009326b94cdf",
        name: "Hip circles",
        instructions:
          "Notes:\n8 circles each direction per side; move without forcing range.\n\nBlock context:\nSegment: other activity\n\nInterval:\nMobility Flow",
        duration: { type: "time", seconds: 180 },
        targets: [{ type: "RPE", intensity: 3 }],
      },
      {
        type: "step",
        id: "c330e956-0f7c-45a2-9bc8-009326b94ce0",
        name: "Thoracic rotations",
        instructions: "Notes:\n8 rotations per side; keep the hips quiet.",
        duration: { type: "time", seconds: 180 },
        targets: [{ type: "RPE", intensity: 3 }],
      },
      {
        type: "step",
        id: "c330e956-0f7c-45a2-9bc8-009326b94ce1",
        name: "Ankle rocks",
        instructions: "Notes:\n10 controlled rocks per side with the heel down.",
        duration: { type: "time", seconds: 180 },
        targets: [{ type: "RPE", intensity: 3 }],
      },
      {
        type: "step",
        id: "c330e956-0f7c-45a2-9bc8-009326b94ce2",
        name: "Shoulder circles",
        instructions: "Notes:\n8 circles forward, then 8 backward.",
        duration: { type: "time", seconds: 180 },
        targets: [{ type: "RPE", intensity: 3 }],
      },
      {
        type: "step",
        id: "c330e956-0f7c-45a2-9bc8-009326b94ce3",
        name: "Half-kneeling hip flexor reach",
        instructions: "Notes:\n5 slow reaches per side; keep the ribs stacked.",
        duration: { type: "time", seconds: 180 },
        targets: [{ type: "RPE", intensity: 3 }],
      },
      {
        type: "step",
        id: "c330e956-0f7c-45a2-9bc8-009326b94ce4",
        name: "Cat-cow",
        instructions: "Notes:\n8 slow repetitions, matching each movement to an easy breath.",
        duration: { type: "time", seconds: 180 },
        targets: [{ type: "RPE", intensity: 3 }],
      },
      {
        type: "step",
        id: "26b90093-7205-4cdf-be51-ab18d13ef764",
        name: "Cooldown",
        instructions:
          "Notes:\nEase gradually and finish with calm breathing.\n\nBlock context:\nSegment: other activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 300,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  "f2a00000-0002-4000-8001-000000000005": {
    version: 5,
    activity_category: "other",
    items: [
      {
        type: "step",
        id: "42d51caf-f689-4063-9a6d-7feca51233a0",
        name: "Warmup",
        instructions:
          "Notes:\nBegin easily and check that movement feels comfortable today.\n\nBlock context:\nSegment: other activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 360,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
      {
        type: "step",
        id: "89f663d0-d542-4f1c-a18e-b2458c1f66f9",
        name: "Mountain pose",
        instructions:
          "Notes:\nHold for 5 calm breaths, then transition slowly.\n\nBlock context:\nSegment: other activity\n\nInterval:\nBalance Flow",
        duration: { type: "time", seconds: 300 },
        targets: [{ type: "RPE", intensity: 4 }],
      },
      {
        type: "step",
        id: "89f663d0-d542-4f1c-a18e-b2458c1f66fa",
        name: "Chair pose",
        instructions: "Notes:\nHold for 5 calm breaths; keep weight even through both feet.",
        duration: { type: "time", seconds: 300 },
        targets: [{ type: "RPE", intensity: 4 }],
      },
      {
        type: "step",
        id: "89f663d0-d542-4f1c-a18e-b2458c1f66fb",
        name: "Warrior II",
        instructions: "Notes:\nHold for 5 calm breaths on the left, then 5 on the right.",
        duration: { type: "time", seconds: 300 },
        targets: [{ type: "RPE", intensity: 4 }],
      },
      {
        type: "step",
        id: "89f663d0-d542-4f1c-a18e-b2458c1f66fc",
        name: "Triangle pose",
        instructions: "Notes:\nHold for 5 calm breaths on the left, then 5 on the right.",
        duration: { type: "time", seconds: 300 },
        targets: [{ type: "RPE", intensity: 4 }],
      },
      {
        type: "step",
        id: "89f663d0-d542-4f1c-a18e-b2458c1f66fd",
        name: "Tree pose",
        instructions:
          "Notes:\nHold for 5 calm breaths on the left, then 5 on the right; use a wall if needed.",
        duration: { type: "time", seconds: 300 },
        targets: [{ type: "RPE", intensity: 4 }],
      },
      {
        type: "step",
        id: "89f663d0-d542-4f1c-a18e-b2458c1f66fe",
        name: "Seated twist",
        instructions: "Notes:\nHold for 5 calm breaths on the left, then 5 on the right.",
        duration: { type: "time", seconds: 300 },
        targets: [{ type: "RPE", intensity: 4 }],
      },
      {
        type: "step",
        id: "3ccf62f5-f083-46a9-9467-6dda47b4218e",
        name: "Cooldown",
        instructions:
          "Notes:\nEase gradually and finish with calm breathing.\n\nBlock context:\nSegment: other activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 300,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  "a4e10000-0001-4000-8001-000000000001": {
    version: 5,
    activity_category: "run",
    items: [
      {
        type: "step",
        id: "a6398013-f285-4c5f-bed1-2b9851be77e4",
        name: "Warmup",
        instructions: "Block context:\nSegment: run activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 720,
        },
        targets: [
          {
            type: "%MaxHR",
            intensity: 70,
          },
        ],
      },
      {
        type: "repeat",
        id: "1caf42d5-d063-4689-b447-4dba2794016e",
        count: 4,
        steps: [
          {
            type: "step",
            id: "c734ed5a-7be8-410e-af9c-4cdf72050093",
            name: "Work",
            instructions:
              "Notes:\nBuild into 90–95% HRmax without sprinting the first minute.\n\nBlock context:\nSegment: run activity\n\nInterval:\n4×4 Aerobic Power",
            duration: {
              type: "time",
              seconds: 240,
            },
            targets: [
              {
                type: "%MaxHR",
                intensity: 90,
              },
            ],
          },
          {
            type: "step",
            id: "da6db447-8e21-48fb-82d5-67d48dfa1b88",
            name: "Active Recovery",
            instructions:
              "Notes:\nJog easily at about 70% HRmax; recover actively rather than standing still.",
            duration: {
              type: "time",
              seconds: 180,
            },
            targets: [
              {
                type: "%MaxHR",
                intensity: 70,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "9c2fc255-50e3-4609-b4c7-cd3aa71481ee",
        name: "Cooldown",
        instructions: "Block context:\nSegment: run activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "%MaxHR",
            intensity: 65,
          },
        ],
      },
    ],
  },
  "a4e20000-0001-4000-8001-000000000005": {
    version: 5,
    activity_category: "run",
    items: [
      {
        type: "step",
        id: "ae41881b-fa8d-4467-96a9-e35009762f9c",
        name: "Warmup",
        instructions: "Block context:\nSegment: run activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 900,
        },
        targets: [
          {
            type: "RPE",
            intensity: 3,
          },
        ],
      },
      {
        type: "repeat",
        id: "58eb7e11-a437-4a5d-8053-c12e9b080d7a",
        count: 4,
        steps: [
          {
            type: "step",
            id: "c12e9b08-0d7a-4754-a996-3acd14a7ee81",
            name: "Controlled Work",
            instructions:
              "Notes:\nHold a repeatable sub-threshold effort at RPE 6–7; slow down if the individual calibration is no longer controlled.\n\nBlock context:\nSegment: run activity\n\nInterval:\nControlled Threshold Repeats",
            duration: {
              type: "distance",
              meters: 2000,
            },
            targets: [
              {
                type: "RPE",
                intensity: 7,
              },
            ],
          },
          {
            type: "step",
            id: "ea7dc457-9e31-480b-92e5-37a45dcaeb58",
            name: "Float Recovery",
            instructions:
              "Notes:\nUse an easy jog float; do not turn the recovery into a full stop.",
            duration: {
              type: "time",
              seconds: 60,
            },
            targets: [
              {
                type: "RPE",
                intensity: 2,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "d86bfe91-24b7-4add-80d3-41ae1b888dfa",
        name: "Cooldown",
        instructions: "Block context:\nSegment: run activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  "a4e20000-0001-4000-8004-000000000008": {
    version: 5,
    activity_category: "run",
    items: [
      {
        type: "step",
        id: "fb68218e-47b4-4dda-a3d0-881bae41d467",
        name: "Warmup",
        instructions: "Block context:\nSegment: run activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 900,
        },
        targets: [
          {
            type: "RPE",
            intensity: 3,
          },
        ],
      },
      {
        type: "repeat",
        id: "a10e7be8-ed5a-4734-8976-9a2d74074ee1",
        count: 25,
        steps: [
          {
            type: "step",
            id: "48db6e01-9427-4a4d-b043-f15ecb383daa",
            name: "Controlled Work",
            instructions:
              "Notes:\nHold a repeatable sub-threshold RPE 6–7; this distinct short-repeat protocol is not a long-repeat dose state.\n\nBlock context:\nSegment: run activity\n\nInterval:\n25×400 Controlled Threshold",
            duration: {
              type: "distance",
              meters: 400,
            },
            targets: [
              {
                type: "RPE",
                intensity: 7,
              },
            ],
          },
          {
            type: "step",
            id: "f7641d8a-ab18-413e-9fcc-3ccf62f5f083",
            name: "Float Recovery",
            instructions: "Notes:\nUse an easy jog float between controlled repeats.",
            duration: {
              type: "time",
              seconds: 30,
            },
            targets: [
              {
                type: "RPE",
                intensity: 2,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "218efb68-6dda-47b4-89f6-1aadf487ce61",
        name: "Cooldown",
        instructions: "Block context:\nSegment: run activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  "a4e40000-0001-4000-8001-000000000013": {
    version: 5,
    activity_category: "swim",
    items: [
      {
        type: "step",
        id: "48db6e01-9427-4a4d-b043-f15ecb383daa",
        name: "Warmup",
        instructions:
          "Notes:\nSwim easy freestyle and finish with a long, relaxed stroke.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nWarmup",
        duration: {
          type: "distance",
          meters: 400,
        },
        targets: [
          {
            type: "RPE",
            intensity: 3,
          },
        ],
      },
      {
        type: "repeat",
        id: "ea7dc457-9e31-480b-92e5-37a45dcaeb58",
        count: 8,
        steps: [
          {
            type: "step",
            id: "61ce3ba8-ad1a-47f4-8936-da6db4478e21",
            name: "CSS Work",
            instructions:
              "Notes:\nSwim at individually estimated CSS pace at RPE 7 with a long, repeatable stroke.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nCSS Repeats",
            duration: {
              type: "distance",
              meters: 100,
            },
            targets: [
              {
                type: "RPE",
                intensity: 7,
              },
            ],
          },
          {
            type: "step",
            id: "bc4fe275-7003-4629-94e7-ed5ac734a10e",
            name: "Short Rest",
            instructions:
              "Notes:\nTake a short wall rest, then leave on the planned interval without rushing technique.",
            duration: {
              type: "time",
              seconds: 15,
            },
            targets: [
              {
                type: "rest",
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "6afd44d7-1eb1-488b-9265-b724dd4a6bd8",
        name: "Cooldown",
        instructions:
          "Notes:\nSwim down easy freestyle or backstroke.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nCooldown",
        duration: {
          type: "distance",
          meters: 200,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  "aaaa1111-2222-4333-8444-555555555555": {
    version: 5,
    activity_category: "strength",
    items: [
      {
        type: "step",
        id: "96297003-e275-4c4f-aec1-5bc881eea714",
        name: "Movement Prep",
        instructions:
          "Notes:\nDynamic movements to prepare entire body\n\nBlock context:\nSegment: strength activity\n\nInterval:\nMovement Prep",
        duration: {
          type: "time",
          seconds: 300,
        },
        targets: [
          {
            type: "RPE",
            intensity: 4,
          },
        ],
      },
      {
        type: "repeat",
        id: "74079a2d-28bb-4ee1-9c6f-95026fdc49b6",
        count: 5,
        steps: [
          {
            type: "step",
            id: "61ce3ba8-ad1a-47f4-8936-da6db4478e21",
            name: "Circuit Round",
            instructions:
              "Notes:\nSix 45-second stations with 15 seconds complete rest after each: burpee, mountain climbers, squat jumps, push-ups, then repeat burpee and mountain climbers (6 minutes total).\n\nBlock context:\nSegment: strength activity\n\nInterval:\nCircuit stations",
            duration: { type: "time", seconds: 360 },
            targets: [{ type: "RPE", intensity: 8 }],
          },
          {
            type: "step",
            id: "aa3d8417-5ef1-48cb-92a5-77e49d0a2b98",
            name: "Active Recovery",
            instructions:
              "Notes:\nWalk slowly and take six unhurried breaths before the next round.",
            duration: {
              type: "time",
              seconds: 120,
            },
            targets: [
              {
                type: "RPE",
                intensity: 3,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "f4871aad-a83b-4e61-9cef-1582ef5cc936",
        name: "Recovery Stretch",
        instructions:
          "Notes:\nStatic stretches for all major muscle groups\n\nBlock context:\nSegment: strength activity\n\nInterval:\nRecovery Stretch",
        duration: {
          type: "time",
          seconds: 300,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  "aaaa2222-3333-4444-9555-666666666666": {
    version: 5,
    activity_category: "strength",
    items: [
      {
        type: "step",
        id: "9300b926-df4c-4572-ab98-9023b649dc6f",
        name: "Core Activation",
        instructions:
          "Notes:\nBreathing exercises, gentle core engagement\n\nBlock context:\nSegment: strength activity\n\nInterval:\nCore Activation",
        duration: {
          type: "time",
          seconds: 300,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
      {
        type: "repeat",
        id: "1582ef5c-c936-4310-ad1a-36c910a38215",
        count: 3,
        steps: [
          {
            type: "step",
            id: "82155cef-36c9-40a3-9aad-3fac65d2f360",
            name: "Plank Variations",
            instructions:
              "Notes:\n30 seconds front plank, 30 seconds left side plank, 30 seconds right side plank, 30 seconds front plank; repeat once (4 minutes total).\n\nBlock context:\nSegment: strength activity\n\nInterval:\nInterval 2",
            duration: {
              type: "time",
              seconds: 240,
            },
            targets: [
              {
                type: "RPE",
                intensity: 5,
              },
            ],
          },
          {
            type: "step",
            id: "e7540d7a-9b08-412e-8fbc-6cff922520b3",
            name: "Dynamic Core",
            instructions:
              "Notes:\n45 seconds dead bug, bird dog, bicycle crunch, then leg raise; take 15 seconds to transition after each exercise (4 minutes total). Alternate sides on dead bugs, bird dogs, and bicycle crunches.",
            duration: {
              type: "time",
              seconds: 240,
            },
            targets: [
              {
                type: "RPE",
                intensity: 6,
              },
            ],
          },
          {
            type: "step",
            id: "54e77a0d-089b-4ec1-bc4f-75e24fbc2996",
            name: "Recovery",
            instructions: "Notes:\nWalk slowly and take six unhurried breaths.",
            duration: {
              type: "time",
              seconds: 60,
            },
            targets: [
              {
                type: "RPE",
                intensity: 2,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "95026fdc-49b6-4390-ad9a-b64990230295",
        name: "Hip and Spine Mobility",
        instructions:
          "Notes:\n8 cat-cow repetitions, 8 hip circles each direction per side, then 8 spinal twists per side.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nHip and Spine Mobility",
        duration: {
          type: "time",
          seconds: 300,
        },
        targets: [
          {
            type: "RPE",
            intensity: 1,
          },
        ],
      },
    ],
  },
  "aaaa3333-4444-4555-a666-777777777777": {
    version: 5,
    activity_category: "strength",
    items: [
      {
        type: "step",
        id: "56e930c3-a235-4c0f-ae81-9b08c12ee754",
        name: "Movement Preparation",
        instructions:
          "Notes:\n8 hip circles per side, 8 shoulder circles each direction, then 8 bodyweight squats.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nMovement Preparation",
        duration: {
          type: "time",
          seconds: 300,
        },
        targets: [
          {
            type: "RPE",
            intensity: 3,
          },
        ],
      },
      {
        type: "repeat",
        id: "d467fa8d-881b-4e41-bccf-f562cf3ca916",
        count: 4,
        steps: [
          {
            type: "step",
            id: "a5127fec-59c6-43a0-bdaa-861960f3d265",
            name: "Squat Patterns",
            instructions:
              "Notes:\nPerform controlled goblet squats for the full 3 minutes; reset posture between repetitions.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nInterval 2",
            duration: {
              type: "time",
              seconds: 180,
            },
            targets: [
              {
                type: "RPE",
                intensity: 5,
              },
            ],
          },
          {
            type: "step",
            id: "7a0d54e7-2ec1-489b-a275-07742d9abb28",
            name: "Hinge Patterns",
            instructions:
              "Notes:\nPerform controlled Romanian deadlifts for the full 3 minutes; keep the spine neutral.",
            duration: {
              type: "time",
              seconds: 180,
            },
            targets: [
              {
                type: "RPE",
                intensity: 5,
              },
            ],
          },
          {
            type: "step",
            id: "eb58117e-37a4-4dca-93c0-b84bde710497",
            name: "Push/Pull Patterns",
            instructions:
              "Notes:\nPerform controlled push-ups for the full 3 minutes; use a stable elevated surface if needed to keep the same movement pattern.",
            duration: {
              type: "time",
              seconds: 180,
            },
            targets: [
              {
                type: "RPE",
                intensity: 5,
              },
            ],
          },
          {
            type: "step",
            id: "18ab3ed1-64f7-4a1d-8013-016edb484dba",
            name: "Transition",
            instructions:
              "Notes:\nWalk slowly, take six unhurried breaths, and set up for the next round.",
            duration: {
              type: "time",
              seconds: 60,
            },
            targets: [
              {
                type: "RPE",
                intensity: 3,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "54e77a0d-089b-4ec1-bc4f-75e24fbc2996",
        name: "Movement Integration",
        instructions:
          "Notes:\nWalk slowly for 2 minutes, then complete 8 cat-cow repetitions and 8 standing reaches per side.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nMovement Integration",
        duration: {
          type: "time",
          seconds: 300,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  "e9f5a8b7-2c6d-4e0f-9a4b-6c3d9e8f7a0b": {
    version: 5,
    activity_category: "strength",
    items: [
      {
        type: "step",
        id: "8a1d64f7-3ed1-48ab-b285-d744fd6a8bf8",
        name: "Warmup",
        instructions:
          "Notes:\nDynamic stretching and mobility\n\nBlock context:\nSegment: strength activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 300,
        },
        targets: [
          {
            type: "RPE",
            intensity: 3,
          },
        ],
      },
      {
        type: "repeat",
        id: "24b74add-d86b-4e91-8c1f-85f25fcc39a6",
        count: 3,
        steps: [
          {
            type: "step",
            id: "9d0a77e4-51be-4b98-8572-4ee128bb9a2d",
            name: "Bench Press",
            instructions:
              "Notes:\nChoose a load that leaves about two clean reps in reserve; use safeties or a spotter.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nBench Press",
            duration: {
              type: "repetitions",
              count: 8,
            },
            targets: [
              {
                type: "RPE",
                intensity: 8,
              },
            ],
          },
          {
            type: "step",
            id: "0699e073-52e5-4cbf-9e31-0b78319e57c4",
            name: "Rest",
            duration: {
              type: "time",
              seconds: 120,
            },
            targets: [
              {
                type: "rest",
              },
            ],
          },
        ],
      },
      {
        type: "repeat",
        id: "c12e9b08-0d7a-4754-a996-3acd14a7ee81",
        count: 3,
        steps: [
          {
            type: "step",
            id: "a437ca5d-58eb-4e11-8c9f-0572df4cb926",
            name: "Bent Over Rows",
            instructions:
              "Notes:\nLeave about three clean reps in reserve; keep the torso stable without jerking.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nRows",
            duration: {
              type: "repetitions",
              count: 10,
            },
            targets: [
              {
                type: "RPE",
                intensity: 7,
              },
            ],
          },
          {
            type: "step",
            id: "1b8841ae-67d4-4dfa-83f0-a83bce61f487",
            name: "Rest",
            duration: {
              type: "time",
              seconds: 120,
            },
            targets: [
              {
                type: "rest",
              },
            ],
          },
        ],
      },
      {
        type: "repeat",
        id: "9a2d7407-4ee1-48bb-8295-a714cd3a5bc8",
        count: 3,
        steps: [
          {
            type: "step",
            id: "3fac65d2-f360-4986-9744-9427ba4d48db",
            name: "Overhead Press",
            instructions:
              "Notes:\nLeave about two clean reps in reserve; stop before leaning back or grinding.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nOverhead Press",
            duration: {
              type: "repetitions",
              count: 8,
            },
            targets: [
              {
                type: "RPE",
                intensity: 8,
              },
            ],
          },
          {
            type: "step",
            id: "58eb7e11-a437-4a5d-8053-c12e9b080d7a",
            name: "Rest",
            duration: {
              type: "time",
              seconds: 120,
            },
            targets: [
              {
                type: "rest",
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "26b90093-7205-4cdf-be51-ab18d13ef764",
        name: "Cooldown",
        instructions:
          "Notes:\nStatic stretching\n\nBlock context:\nSegment: strength activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 300,
        },
        targets: [
          {
            type: "RPE",
            intensity: 1,
          },
        ],
      },
    ],
  },
  "f0a6b9c8-3d7e-4f1a-ab5c-7d4e0f9a8b1c": {
    version: 5,
    activity_category: "strength",
    items: [
      {
        type: "step",
        id: "2d9a0774-e14e-4b28-9502-9e31780bea7d",
        name: "Warmup",
        instructions:
          "Notes:\nDynamic leg swings and mobility\n\nBlock context:\nSegment: strength activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 300,
        },
        targets: [
          {
            type: "RPE",
            intensity: 3,
          },
        ],
      },
      {
        type: "repeat",
        id: "eb58117e-37a4-4dca-93c0-b84bde710497",
        count: 4,
        steps: [
          {
            type: "step",
            id: "5ef138cb-aa3d-4417-8659-d340f9661f8c",
            name: "Back Squats",
            instructions:
              "Notes:\nLeave about two clean reps in reserve; maintain depth and bracing with safeties set.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nSquats",
            duration: {
              type: "repetitions",
              count: 5,
            },
            targets: [
              {
                type: "RPE",
                intensity: 8,
              },
            ],
          },
          {
            type: "step",
            id: "117eeb58-5dca-47a4-b9e6-ca5da4377e11",
            name: "Rest",
            instructions: "Notes:\nFull recovery",
            duration: {
              type: "time",
              seconds: 180,
            },
            targets: [
              {
                type: "rest",
              },
            ],
          },
        ],
      },
      {
        type: "repeat",
        id: "ea7dc457-9e31-480b-92e5-37a45dcaeb58",
        count: 3,
        steps: [
          {
            type: "step",
            id: "6bd891fe-b724-4d4a-9340-38cb5ef18417",
            name: "Romanian Deadlifts",
            instructions:
              "Notes:\nLeave about two clean reps in reserve; stop before back position or range changes.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nDeadlifts",
            duration: {
              type: "repetitions",
              count: 8,
            },
            targets: [
              {
                type: "RPE",
                intensity: 8,
              },
            ],
          },
          {
            type: "step",
            id: "009326b9-4cdf-4205-982b-990673e0e552",
            name: "Rest",
            duration: {
              type: "time",
              seconds: 120,
            },
            targets: [
              {
                type: "rest",
              },
            ],
          },
        ],
      },
      {
        type: "repeat",
        id: "9d0a77e4-51be-4b98-8572-4ee128bb9a2d",
        count: 3,
        steps: [
          {
            type: "step",
            id: "5cef8215-10a3-46c9-b487-0d7ae754c12e",
            name: "Walking Lunges",
            instructions:
              "Notes:\nEach leg; leave about three clean reps in reserve and keep balance controlled.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nLunges",
            duration: {
              type: "repetitions",
              count: 12,
            },
            targets: [
              {
                type: "RPE",
                intensity: 7,
              },
            ],
          },
          {
            type: "step",
            id: "87f4ad1a-3ba8-41ce-af5c-8c1fb24540d3",
            name: "Rest",
            duration: {
              type: "time",
              seconds: 120,
            },
            targets: [
              {
                type: "rest",
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "f15ecb38-3daa-4784-99c6-2abd0497de71",
        name: "Cooldown",
        instructions:
          "Notes:\nFoam rolling and stretching\n\nBlock context:\nSegment: strength activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 300,
        },
        targets: [
          {
            type: "RPE",
            intensity: 1,
          },
        ],
      },
    ],
  },
  "4a7b8c9d-0e1f-4a3b-8c5d-6e7f8a9b0c1d": {
    version: 5,
    activity_category: "swim",
    items: [
      {
        type: "step",
        id: "f3601986-3fac-45d2-8bf8-f08316a93ccf",
        name: "Progressive Warm-up",
        instructions:
          "Notes:\nSwim 400 m easy freestyle, then build the final 100 m freestyle to prepare for speed.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nProgressive Warm-up",
        duration: {
          type: "distance",
          meters: 500,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 65,
          },
        ],
      },
      {
        type: "repeat",
        id: "d13eab18-1d8a-4764-b9a6-0a9de477be51",
        count: 8,
        steps: [
          {
            type: "step",
            id: "ca5da437-7e11-48eb-b2c5-9704bd2a4bb8",
            name: "Sprint",
            instructions:
              "Notes:\nSwim fast freestyle with a quick catch and clean body line.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nInterval 2",
            duration: {
              type: "distance",
              meters: 25,
            },
            targets: [
              {
                type: "%ThresholdHR",
                intensity: 95,
              },
            ],
          },
          {
            type: "step",
            id: "ff6c2592-b320-4946-9704-d467fa8d881b",
            name: "Recovery",
            instructions: "Notes:\nSwim very easy backstroke or freestyle to recover.",
            duration: {
              type: "distance",
              meters: 50,
            },
            targets: [
              {
                type: "%ThresholdHR",
                intensity: 60,
              },
            ],
          },
        ],
      },
      {
        type: "repeat",
        id: "ce61a83b-1aad-4487-b6c9-83f0a916cf3c",
        count: 6,
        steps: [
          {
            type: "step",
            id: "51be2b98-9d0a-47e4-b926-8a1d64f73ed1",
            name: "Longer Sprint",
            instructions:
              "Notes:\nSwim fast freestyle with a controlled catch and stroke length.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nInterval 3",
            duration: {
              type: "distance",
              meters: 50,
            },
            targets: [
              {
                type: "%ThresholdHR",
                intensity: 90,
              },
            ],
          },
          {
            type: "step",
            id: "a437ca5d-58eb-4e11-8c9f-0572df4cb926",
            name: "Active Recovery",
            instructions: "Notes:\nSwim easy backstroke or freestyle.",
            duration: {
              type: "distance",
              meters: 100,
            },
            targets: [
              {
                type: "%ThresholdHR",
                intensity: 60,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "18ab3ed1-64f7-4a1d-8013-016edb484dba",
        name: "Cool-down",
        instructions:
          "Notes:\nSwim very easy backstroke, breaststroke, or freestyle.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nCool-down",
        duration: {
          type: "distance",
          meters: 400,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 55,
          },
        ],
      },
    ],
  },
  "5b8c9d0e-1f2a-4b4c-9d6e-7f8a9b0c1d2e": {
    version: 5,
    activity_category: "swim",
    items: [
      {
        type: "step",
        id: "e552bf2c-9906-43e0-bdea-46d920b39225",
        name: "Warm-up",
        instructions:
          "Notes:\nSwim 400 m easy freestyle, then use catch-up drill for 4×50 m before building the final 100 m freestyle.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nWarm-up",
        duration: {
          type: "distance",
          meters: 600,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 65,
          },
        ],
      },
      {
        type: "repeat",
        id: "3ba861ce-87f4-4d1a-a310-48db6e019427",
        count: 4,
        steps: [
          {
            type: "step",
            id: "16a9f083-62f5-4ccf-ae41-db48016e2794",
            name: "Threshold Interval",
            instructions:
              "Notes:\nSwim freestyle at a steady, sustainable threshold effort with a firm catch.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nInterval 2",
            duration: {
              type: "distance",
              meters: 400,
            },
            targets: [
              {
                type: "%ThresholdHR",
                intensity: 85,
              },
            ],
          },
          {
            type: "step",
            id: "1986f360-65d2-4fac-b11e-82155cef36c9",
            name: "Recovery",
            instructions: "Notes:\nSwim easy backstroke or freestyle to recover.",
            duration: {
              type: "distance",
              meters: 100,
            },
            targets: [
              {
                type: "%ThresholdHR",
                intensity: 65,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "bb28e14e-0774-4d9a-a390-c85bee8114a7",
        name: "Cool-down",
        instructions:
          "Notes:\nSwim very easy backstroke, breaststroke, or freestyle; float at the wall if needed.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nCool-down",
        duration: {
          type: "distance",
          meters: 400,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 55,
          },
        ],
      },
    ],
  },
  "6c9d0e1f-2a3b-4c5d-ae7f-8a9b0c1d2e3f": {
    version: 5,
    activity_category: "swim",
    items: [
      {
        type: "step",
        id: "1f8c45b2-d340-4966-b724-f4871aada83b",
        name: "Easy Warm-up",
        instructions:
          "Notes:\nSwim easy freestyle and backstroke, focusing on feel for the water.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nEasy Warm-up",
        duration: {
          type: "distance",
          meters: 300,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 60,
          },
        ],
      },
      {
        type: "repeat",
        id: "d13eab18-1d8a-4764-b9a6-0a9de477be51",
        count: 3,
        steps: [
          {
            type: "step",
            id: "a83bce61-f487-4aad-90a3-51be2b989d0a",
            name: "Freestyle Drills",
            instructions:
              "Notes:\nSwim catch-up, fingertip-drag, and single-arm freestyle drills.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nInterval 2",
            duration: {
              type: "distance",
              meters: 200,
            },
            targets: [
              {
                type: "%ThresholdHR",
                intensity: 65,
              },
            ],
          },
          {
            type: "step",
            id: "138039a6-5fcc-45f2-ab18-10a336c95cef",
            name: "Build Swimming",
            instructions:
              "Notes:\nSwim freestyle from easy to strong, building speed while maintaining technique.",
            duration: {
              type: "distance",
              meters: 150,
            },
            targets: [
              {
                type: "%ThresholdHR",
                intensity: 75,
              },
            ],
          },
          {
            type: "step",
            id: "a2357c0f-56e9-40c3-bacd-df4c05729300",
            name: "Easy Recovery",
            instructions: "Notes:\nSwim easy backstroke or freestyle.",
            duration: {
              type: "distance",
              meters: 100,
            },
            targets: [
              {
                type: "%ThresholdHR",
                intensity: 60,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "51be2b98-9d0a-47e4-b926-8a1d64f73ed1",
        name: "Mixed Strokes",
        instructions:
          "Notes:\nSwim backstroke, breaststroke, and freestyle with relaxed transitions.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nMixed Strokes",
        duration: {
          type: "distance",
          meters: 300,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 70,
          },
        ],
      },
      {
        type: "step",
        id: "7a0d54e7-2ec1-489b-a275-07742d9abb28",
        name: "Cool-down",
        instructions:
          "Notes:\nSwim very easy backstroke, breaststroke, or freestyle.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nCool-down",
        duration: {
          type: "distance",
          meters: 200,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 55,
          },
        ],
      },
    ],
  },
  "7d0e1f2a-3b4c-4d6e-bf8a-9b0c1d2e3f4a": {
    version: 5,
    activity_category: "swim",
    items: [
      {
        type: "step",
        id: "117eeb58-5dca-47a4-b9e6-ca5da4377e11",
        name: "Extended Warm-up",
        instructions:
          "Notes:\nSwim 400 m easy freestyle, use catch-up drill for 4×50 m, then build the final 100 m freestyle.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nExtended Warm-up",
        duration: {
          type: "distance",
          meters: 600,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 60,
          },
        ],
      },
      {
        type: "step",
        id: "ac3fd265-60f3-4619-84d7-9d0a77e451be",
        name: "Endurance Block 1",
        instructions:
          "Notes:\nSwim freestyle at a steady aerobic effort with controlled breathing and stroke length.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nEndurance Block 1",
        duration: {
          type: "distance",
          meters: 1200,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 70,
          },
        ],
      },
      {
        type: "step",
        id: "ab18d13e-f764-4d8a-9380-f88b1eb144d7",
        name: "Easy Recovery",
        instructions:
          "Notes:\nSwim easy backstroke or very easy freestyle.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nEasy Recovery",
        duration: {
          type: "distance",
          meters: 200,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 60,
          },
        ],
      },
      {
        type: "step",
        id: "56e930c3-a235-4c0f-ae81-9b08c12ee754",
        name: "Endurance Block 2",
        instructions:
          "Notes:\nSwim freestyle slightly stronger than Block 1 while keeping the effort aerobic.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nEndurance Block 2",
        duration: {
          type: "distance",
          meters: 1200,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 75,
          },
        ],
      },
      {
        type: "step",
        id: "f562cf3c-a916-43f0-8dfa-16a9f08362f5",
        name: "Variable Pace",
        instructions:
          "Notes:\nSwim 4×50 m freestyle, descending each 50 m from easy to strong while preserving stroke length.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nVariable Pace",
        duration: {
          type: "distance",
          meters: 200,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 70,
          },
        ],
      },
      {
        type: "step",
        id: "50e37609-9c2f-4255-a87b-2996037075e2",
        name: "Cool-down",
        instructions:
          "Notes:\nSwim very easy backstroke, breaststroke, or freestyle; float at the wall if needed.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nCool-down",
        duration: {
          type: "distance",
          meters: 100,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 55,
          },
        ],
      },
    ],
  },
  "6a9b0c1d-2e3f-4a5b-ac7d-8e9f0a1b2c3d": {
    version: 5,
    activity_category: "other",
    items: [
      {
        type: "step",
        id: "33a059c6-7fec-4512-8b38-b043d669fc8f",
        name: "General Warm-up",
        instructions:
          "Notes:\nRow/bike, dynamic stretching, movement prep\n\nBlock context:\nSegment: other activity\n\nInterval:\nGeneral Warm-up",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "%MaxHR",
            intensity: 65,
          },
        ],
      },
      {
        type: "step",
        id: "d467fa8d-881b-4e41-bccf-f562cf3ca916",
        name: "Specific Warm-up",
        instructions:
          "Notes:\nPractice WOD movements at light weight/modified versions\n\nBlock context:\nSegment: other activity\n\nInterval:\nSpecific Warm-up",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "%MaxHR",
            intensity: 70,
          },
        ],
      },
      {
        type: "step",
        id: "41ae1b88-8dfa-47d4-a916-ba4d94276e01",
        name: "Main WOD",
        instructions:
          "Notes:\nAMRAP, EMOM, or time-based activity - push hard but maintain form\n\nBlock context:\nSegment: other activity\n\nInterval:\nMain WOD",
        duration: {
          type: "time",
          seconds: 900,
        },
        targets: [
          {
            type: "%MaxHR",
            intensity: 90,
          },
        ],
      },
      {
        type: "step",
        id: "92256cff-46d9-40b3-aabd-0f7c35a2c330",
        name: "Cool-down & Mobility",
        instructions:
          "Notes:\nEasy movement, static stretching, foam rolling\n\nBlock context:\nSegment: other activity\n\nInterval:\nCool-down & Mobility",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "%MaxHR",
            intensity: 50,
          },
        ],
      },
    ],
  },
  "5d191bf2-0c3e-4a47-8d58-9bc83ef67101": {
    version: 5,
    activity_category: "other",
    items: [
      {
        type: "step",
        id: "65d23fac-1986-4360-bd6a-c659a03312a5",
        name: "Warmup",
        instructions: "Block context:\nSegment: other activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 720,
        },
        targets: [
          {
            type: "RPE",
            intensity: 3,
          },
        ],
      },
      {
        type: "repeat",
        id: "07742d9a-bb28-414e-afdc-0c9f32c5c053",
        count: 4,
        steps: [
          {
            type: "step",
            id: "cc5ff285-8013-4639-a4f7-bd2a970471de",
            name: "Threshold Row",
            instructions: "Block context:\nSegment: other activity\n\nInterval:\nThreshold Repeats",
            duration: {
              type: "time",
              seconds: 480,
            },
            targets: [
              {
                type: "RPE",
                intensity: 8,
              },
            ],
          },
          {
            type: "step",
            id: "71de4bb8-bd2a-4704-9946-aa3d84175ef1",
            name: "Easy Row",
            duration: {
              type: "time",
              seconds: 180,
            },
            targets: [
              {
                type: "RPE",
                intensity: 2,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "87f4ad1a-3ba8-41ce-af5c-8c1fb24540d3",
        name: "Cooldown",
        instructions: "Block context:\nSegment: other activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  "1f6ea8cb-5df9-42cb-9f04-3ca5a8a6d6d1": {
    version: 5,
    activity_category: "other",
    items: [
      {
        type: "step",
        id: "016edb48-4dba-4794-a9d6-fa8dd467ae41",
        name: "Warmup",
        instructions: "Block context:\nSegment: other activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 720,
        },
        targets: [
          {
            type: "RPE",
            intensity: 3,
          },
        ],
      },
      {
        type: "step",
        id: "12a5ec7f-c659-4033-aa3d-8ffcb52243b0",
        name: "Race Simulation",
        instructions:
          "Notes:\nSustain event-specific pacing and practice planned transitions or fueling.\n\nBlock context:\nSegment: other activity\n\nInterval:\nRace Simulation",
        duration: {
          type: "time",
          seconds: 2160,
        },
        targets: [
          {
            type: "RPE",
            intensity: 7,
          },
        ],
      },
      {
        type: "step",
        id: "8ffcb522-43b0-49d6-a794-24b74addd86b",
        name: "Finishing Effort",
        instructions:
          "Notes:\nFinish strongly while preserving movement quality.\n\nBlock context:\nSegment: other activity\n\nInterval:\nFinishing Effort",
        duration: {
          type: "time",
          seconds: 480,
        },
        targets: [
          {
            type: "RPE",
            intensity: 8,
          },
        ],
      },
      {
        type: "step",
        id: "c053e679-0c9f-42c5-98eb-d946b3202592",
        name: "Cooldown",
        instructions: "Block context:\nSegment: other activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 480,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  ...Object.fromEntries(
    REFERENCE_ASSESSMENT_ACTIVITIES.map((template) => [template.id, template.structure]),
  ),
};

const bySourceSegmentId: Record<string, unknown> = {
  "089b2ec1-54e7-4a0d-b003-319e0b787dea": {
    version: 5,
    activity_category: "swim",
    items: [
      {
        type: "step",
        id: "117eeb58-5dca-47a4-b9e6-ca5da4377e11",
        name: "Extended Warm-up",
        instructions:
          "Notes:\nSwim 400 m easy freestyle, use catch-up drill for 4×50 m, then build the final 100 m freestyle.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nExtended Warm-up",
        duration: {
          type: "distance",
          meters: 600,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 60,
          },
        ],
      },
      {
        type: "step",
        id: "ac3fd265-60f3-4619-84d7-9d0a77e451be",
        name: "Endurance Block 1",
        instructions:
          "Notes:\nSteady aerobic pace - should feel sustainable and controlled\n\nBlock context:\nSegment: swim activity\n\nInterval:\nEndurance Block 1",
        duration: {
          type: "distance",
          meters: 1200,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 72,
          },
        ],
      },
      {
        type: "step",
        id: "ab18d13e-f764-4d8a-9380-f88b1eb144d7",
        name: "Easy Recovery",
        instructions:
          "Notes:\nEasy backstroke or very easy freestyle\n\nBlock context:\nSegment: swim activity\n\nInterval:\nEasy Recovery",
        duration: {
          type: "distance",
          meters: 200,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 60,
          },
        ],
      },
      {
        type: "step",
        id: "56e930c3-a235-4c0f-ae81-9b08c12ee754",
        name: "Endurance Block 2",
        instructions:
          "Notes:\nSlightly higher intensity than first block - still aerobic\n\nBlock context:\nSegment: swim activity\n\nInterval:\nEndurance Block 2",
        duration: {
          type: "distance",
          meters: 1200,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 75,
          },
        ],
      },
      {
        type: "step",
        id: "f562cf3c-a916-43f0-8dfa-16a9f08362f5",
        name: "Variable Pace",
        instructions:
          "Notes:\nSwim 4×50 m freestyle, descending each 50 m from easy to strong while preserving stroke length.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nVariable Pace",
        duration: {
          type: "distance",
          meters: 200,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 70,
          },
        ],
      },
      {
        type: "step",
        id: "50e37609-9c2f-4255-a87b-2996037075e2",
        name: "Cool-down",
        instructions:
          "Notes:\nVery easy mixed strokes and floating\n\nBlock context:\nSegment: swim activity\n\nInterval:\nCool-down",
        duration: {
          type: "distance",
          meters: 100,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 55,
          },
        ],
      },
    ],
  },
  "9e31780b-ea7d-4457-8699-9300b926df4c": {
    version: 5,
    activity_category: "bike",
    items: [
      {
        type: "step",
        id: "0b78319e-57c4-4dea-b3e0-58eb7e11a437",
        name: "Warmup",
        instructions: "Block context:\nSegment: bike activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 900,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 60,
          },
        ],
      },
      {
        type: "step",
        id: "ea7dc457-9e31-480b-92e5-37a45dcaeb58",
        name: "Zone 2 Endurance",
        instructions:
          "Notes:\nKeep it conversational\n\nBlock context:\nSegment: bike activity\n\nInterval:\nMain Set",
        duration: {
          type: "time",
          seconds: 7200,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 70,
          },
        ],
      },
      {
        type: "step",
        id: "e552bf2c-9906-43e0-bdea-46d920b39225",
        name: "Cooldown",
        instructions: "Block context:\nSegment: bike activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 55,
          },
        ],
      },
    ],
  },
  "58eb7e11-a437-4a5d-8053-c12e9b080d7a": {
    version: 5,
    activity_category: "bike",
    items: [
      {
        type: "step",
        id: "7feca512-33a0-49c6-9784-54e77a0d089b",
        name: "Progressive Warm-up",
        instructions:
          "Notes:\nInclude some higher cadence work to prepare for sprints\n\nBlock context:\nSegment: bike activity\n\nInterval:\nProgressive Warm-up",
        duration: {
          type: "time",
          seconds: 900,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 60,
          },
        ],
      },
      {
        type: "repeat",
        id: "a91683f0-f562-4f3c-81ae-d265ac3f8619",
        count: 3,
        steps: [
          {
            type: "step",
            id: "4cdf7205-0093-46b9-a477-3daa1784f15e",
            name: "Sprint Opener",
            instructions:
              "Notes:\nAll-out sprint from moderate speed\n\nBlock context:\nSegment: bike activity\n\nInterval:\nInterval 2",
            duration: {
              type: "time",
              seconds: 10,
            },
            targets: [
              {
                type: "RPE",
                intensity: 10,
              },
            ],
          },
          {
            type: "step",
            id: "d340f966-1f8c-45b2-abd8-50e376099c2f",
            name: "Recovery",
            instructions: "Notes:\nComplete recovery",
            duration: {
              type: "time",
              seconds: 230,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 55,
              },
            ],
          },
        ],
      },
      {
        type: "repeat",
        id: "e87b0ea1-34c7-4aed-90e3-117eeb585dca",
        count: 6,
        steps: [
          {
            type: "step",
            id: "29960370-75e2-4fbc-812e-52e52cbf0699",
            name: "Max Sprint",
            instructions:
              "Notes:\nAll-out sprint - maximum power output\n\nBlock context:\nSegment: bike activity\n\nInterval:\nInterval 3",
            duration: {
              type: "time",
              seconds: 15,
            },
            targets: [
              {
                type: "RPE",
                intensity: 10,
              },
            ],
          },
          {
            type: "step",
            id: "da6db447-8e21-48fb-82d5-67d48dfa1b88",
            name: "Recovery",
            instructions: "Notes:\nComplete recovery is essential for quality",
            duration: {
              type: "time",
              seconds: 345,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 50,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "e679c053-32c5-4c9f-be11-eb58117e37a4",
        name: "Cool-down",
        instructions:
          "Notes:\nEasy spinning to flush lactate\n\nBlock context:\nSegment: bike activity\n\nInterval:\nCool-down",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 50,
          },
        ],
      },
    ],
  },
  "5fcc85f2-1380-49a6-b764-b447da6d68fb": {
    version: 5,
    activity_category: "run",
    items: [
      {
        type: "step",
        id: "dc6f0295-9023-4649-b407-8dfa67d441ae",
        name: "Warmup",
        instructions:
          "Notes:\nJog easily and include mobility drills before faster running.\n\nBlock context:\nSegment: run activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 720,
        },
        targets: [
          {
            type: "RPE",
            intensity: 3,
          },
        ],
      },
      {
        type: "repeat",
        id: "1aadf487-ce61-483b-8215-27944dbadb48",
        count: 4,
        steps: [
          {
            type: "step",
            id: "9b08c12e-e754-4d7a-8370-28bb4ee17407",
            name: "Work",
            instructions:
              "Notes:\nControlled tempo repetitions that develop sustainable speed below threshold strain. Run tall and controlled; preserve the same mechanics through every repetition.\n\nBlock context:\nSegment: run activity\n\nInterval:\nCruise Tempo Run",
            duration: {
              type: "time",
              seconds: 510,
            },
            targets: [
              {
                type: "RPE",
                intensity: 6,
              },
            ],
          },
          {
            type: "step",
            id: "089b2ec1-54e7-4a0d-b003-319e0b787dea",
            name: "Recovery",
            instructions:
              "Notes:\nJog very easily throughout recovery; keep it conversational rather than turning it into another tempo effort.",
            duration: {
              type: "time",
              seconds: 170,
            },
            targets: [
              {
                type: "RPE",
                intensity: 2,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "9a2d7407-4ee1-48bb-8295-a714cd3a5bc8",
        name: "Cooldown",
        instructions:
          "Notes:\nJog easily, then walk until breathing settles.\n\nBlock context:\nSegment: run activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  "cc5ff285-8013-4639-a4f7-bd2a970471de": {
    version: 5,
    activity_category: "bike",
    items: [
      {
        type: "step",
        id: "8ffcb522-43b0-49d6-a794-24b74addd86b",
        name: "Warmup",
        instructions:
          "Notes:\nEasy spin to warm up\n\nBlock context:\nSegment: bike activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 60,
          },
        ],
      },
      {
        type: "step",
        id: "8013a639-cc5f-4285-98ab-1986f36065d2",
        name: "Build",
        instructions:
          "Notes:\nGradually increase intensity\n\nBlock context:\nSegment: bike activity\n\nInterval:\nBuild",
        duration: {
          type: "time",
          seconds: 300,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 75,
          },
        ],
      },
      {
        type: "repeat",
        id: "dc6f0295-9023-4649-b407-8dfa67d441ae",
        count: 3,
        steps: [
          {
            type: "step",
            id: "c936a310-1582-4f5c-a1ce-72054cdf26b9",
            name: "Sweet Spot",
            instructions:
              "Notes:\nSteady effort in sweet spot zone\n\nBlock context:\nSegment: bike activity\n\nInterval:\nSweet Spot",
            duration: {
              type: "time",
              seconds: 600,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 90,
              },
            ],
          },
          {
            type: "step",
            id: "c659a033-12a5-4c7f-9ef1-4bb871de9704",
            name: "Recovery",
            instructions: "Notes:\nEasy recovery spin",
            duration: {
              type: "time",
              seconds: 300,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 55,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "12a5ec7f-c659-4033-aa3d-8ffcb52243b0",
        name: "Cooldown",
        instructions:
          "Notes:\nEasy spin to cool down\n\nBlock context:\nSegment: bike activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 50,
          },
        ],
      },
    ],
  },
  "0d7ae754-c12e-4b08-b5e2-7e1158ebca5d": {
    version: 5,
    activity_category: "bike",
    items: [
      {
        type: "step",
        id: "009326b9-4cdf-4205-982b-990673e0e552",
        name: "Warmup",
        instructions: "Block context:\nSegment: bike activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 900,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 65,
          },
        ],
      },
      {
        type: "repeat",
        id: "ba4d9427-6e01-48db-a2b5-c734ed5a7be8",
        count: 5,
        steps: [
          {
            type: "step",
            id: "49b62390-9502-4fdc-a14e-f285cc5fa639",
            name: "Hard",
            instructions:
              "Notes:\nMaximum sustainable effort\n\nBlock context:\nSegment: bike activity\n\nInterval:\nVO2 Max",
            duration: {
              type: "time",
              seconds: 180,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 120,
              },
            ],
          },
          {
            type: "step",
            id: "8c1fb245-40d3-46f9-a4b7-fd6ad744b11e",
            name: "Recovery",
            instructions: "Notes:\nFull recovery",
            duration: {
              type: "time",
              seconds: 180,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 50,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "3acd14a7-ee81-485b-a235-47b46ddafb68",
        name: "Cooldown",
        instructions: "Block context:\nSegment: bike activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 55,
          },
        ],
      },
    ],
  },
  "68fb8e21-b447-4a6d-9063-91fe6bd8dd4a": {
    version: 5,
    activity_category: "bike",
    items: [
      {
        type: "step",
        id: "89f663d0-d542-4f1c-a18e-b2458c1f66f9",
        name: "Warm-up",
        instructions:
          "Notes:\nInclude some brief higher efforts to open the legs\n\nBlock context:\nSegment: bike activity\n\nInterval:\nWarm-up",
        duration: {
          type: "time",
          seconds: 900,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 60,
          },
        ],
      },
      {
        type: "repeat",
        id: "db48016e-2794-4dba-83b0-e87b0ea134c7",
        count: 5,
        steps: [
          {
            type: "step",
            id: "ec7f12a5-a033-4659-8417-5dca37a4117e",
            name: "Climbing Interval",
            instructions:
              "Notes:\nFind a good climb and push hard - aim for threshold power\n\nBlock context:\nSegment: bike activity\n\nInterval:\nInterval 2",
            duration: {
              type: "time",
              seconds: 360,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 95,
              },
            ],
          },
          {
            type: "step",
            id: "7dea57c4-319e-4b78-a552-2ec1089b7a0d",
            name: "Recovery Descent",
            instructions: "Notes:\nUse terrain to recover - easy spinning or coasting",
            duration: {
              type: "time",
              seconds: 240,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 45,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "5bc881ee-a714-4d3a-8330-68fb8e21b447",
        name: "Cool-down",
        instructions:
          "Notes:\nEasy spinning on flat terrain to recover\n\nBlock context:\nSegment: bike activity\n\nInterval:\nCool-down",
        duration: {
          type: "time",
          seconds: 900,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 50,
          },
        ],
      },
    ],
  },
  "f15ecb38-3daa-4784-99c6-2abd0497de71": {
    version: 5,
    activity_category: "run",
    items: [
      {
        type: "step",
        id: "be51982b-0a9d-4477-a6b9-b320d946ff6c",
        name: "Progressive Warm-up",
        instructions:
          "Notes:\nEasy pace jogging to prepare legs and lungs\n\nBlock context:\nSegment: run activity\n\nInterval:\nProgressive Warm-up",
        duration: {
          type: "time",
          seconds: 900,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 60,
          },
        ],
      },
      {
        type: "repeat",
        id: "f4871aad-a83b-4e61-9cef-1582ef5cc936",
        count: 4,
        steps: [
          {
            type: "step",
            id: "4dba2794-016e-4b48-b522-3ed118ab8a1d",
            name: "Threshold Interval",
            instructions:
              "Notes:\nSteady effort at high intensity\n\nBlock context:\nSegment: run activity\n\nInterval:\nInterval 2",
            duration: {
              type: "time",
              seconds: 300,
            },
            targets: [
              {
                type: "%ThresholdHR",
                intensity: 95,
              },
            ],
          },
          {
            type: "step",
            id: "ea7dc457-9e31-480b-92e5-37a45dcaeb58",
            name: "Active Recovery",
            instructions:
              "Notes:\nJog very easily; walk briefly if needed. Let heart rate fall naturally rather than chasing the target immediately after the effort.",
            duration: {
              type: "time",
              seconds: 180,
            },
            targets: [
              {
                type: "%ThresholdHR",
                intensity: 70,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "74079a2d-28bb-4ee1-9c6f-95026fdc49b6",
        name: "Cool-down",
        instructions:
          "Notes:\nRelaxed pace to flush lactate\n\nBlock context:\nSegment: run activity\n\nInterval:\nCool-down",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 70,
          },
        ],
      },
    ],
  },
  "a10e7be8-ed5a-4734-8976-9a2d74074ee1": {
    version: 5,
    activity_category: "run",
    items: [
      {
        type: "step",
        id: "12a5ec7f-c659-4033-aa3d-8ffcb52243b0",
        name: "Warm-up Jog",
        instructions:
          "Notes:\nGradually increase speed to prep for intervals\n\nBlock context:\nSegment: run activity\n\nInterval:\nWarm-up Jog",
        duration: {
          type: "time",
          seconds: 900,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 60,
          },
        ],
      },
      {
        type: "repeat",
        id: "bc4fe275-7003-4629-94e7-ed5ac734a10e",
        count: 3,
        steps: [
          {
            type: "step",
            id: "e552bf2c-9906-43e0-bdea-46d920b39225",
            name: "Long Threshold Interval",
            instructions:
              "Notes:\nMaintain pace comfortably hard\n\nBlock context:\nSegment: run activity\n\nInterval:\nInterval 2",
            duration: {
              type: "time",
              seconds: 480,
            },
            targets: [
              {
                type: "%ThresholdHR",
                intensity: 95,
              },
            ],
          },
          {
            type: "step",
            id: "a6398013-f285-4c5f-bed1-2b9851be77e4",
            name: "Recovery Jog",
            instructions:
              "Notes:\nJog very easily with relaxed breathing. Let heart rate fall naturally; do not speed up to chase the recovery target.",
            duration: {
              type: "time",
              seconds: 300,
            },
            targets: [
              {
                type: "%ThresholdHR",
                intensity: 60,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "3ccf62f5-f083-46a9-9467-6dda47b4218e",
        name: "Short Threshold Push",
        instructions:
          "Notes:\nPush pace for short duration\n\nBlock context:\nSegment: run activity\n\nInterval:\nShort Threshold Push",
        duration: {
          type: "time",
          seconds: 180,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 95,
          },
        ],
      },
      {
        type: "step",
        id: "1f8c45b2-d340-4966-b724-f4871aada83b",
        name: "Cool-down",
        instructions:
          "Notes:\nRelaxed pace to normalize heart rate\n\nBlock context:\nSegment: run activity\n\nInterval:\nCool-down",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 60,
          },
        ],
      },
    ],
  },
  "eb58117e-37a4-4dca-93c0-b84bde710497": {
    version: 5,
    activity_category: "bike",
    items: [
      {
        type: "step",
        id: "3ccf62f5-f083-46a9-9467-6dda47b4218e",
        name: "Warmup",
        instructions: "Block context:\nSegment: bike activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 900,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 55,
          },
        ],
      },
      {
        type: "repeat",
        id: "e679c053-32c5-4c9f-be11-eb58117e37a4",
        count: 10,
        steps: [
          {
            type: "step",
            id: "5fcc85f2-1380-49a6-b764-b447da6d68fb",
            name: "30-second Work",
            instructions:
              "Notes:\nUse a hard but repeatable aerobic-power effort; do not sprint the first repetitions.\n\nBlock context:\nSegment: bike activity\n\nInterval:\n30/15 Block 1",
            duration: {
              type: "time",
              seconds: 30,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 105,
              },
            ],
          },
          {
            type: "step",
            id: "20b346d9-6cff-4225-b84b-39a6138085f2",
            name: "15-second Recovery",
            instructions: "Notes:\nKeep pedaling very easily through the short recovery.",
            duration: {
              type: "time",
              seconds: 15,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 45,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "66f940d3-b245-4c1f-be91-6bd891feb724",
        name: "Between-set Recovery",
        instructions:
          "Notes:\nPedal easily for three minutes before the next 30/15 block.\n\nBlock context:\nSegment: bike activity\n\nInterval:\nRest",
        duration: {
          type: "time",
          seconds: 180,
        },
        targets: [
          {
            type: "RPE",
            intensity: 1,
          },
        ],
      },
      {
        type: "repeat",
        id: "8c1fb245-40d3-46f9-a4b7-fd6ad744b11e",
        count: 10,
        steps: [
          {
            type: "step",
            id: "1986f360-65d2-4fac-b11e-82155cef36c9",
            name: "30-second Work",
            instructions:
              "Notes:\nUse a hard but repeatable aerobic-power effort; do not sprint the first repetitions.\n\nBlock context:\nSegment: bike activity\n\nInterval:\n30/15 Block 2",
            duration: {
              type: "time",
              seconds: 30,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 105,
              },
            ],
          },
          {
            type: "step",
            id: "a2357c0f-56e9-40c3-bacd-df4c05729300",
            name: "15-second Recovery",
            instructions: "Notes:\nKeep pedaling very easily through the short recovery.",
            duration: {
              type: "time",
              seconds: 15,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 45,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "009326b9-4cdf-4205-982b-990673e0e552",
        name: "Between-set Recovery",
        instructions:
          "Notes:\nPedal easily for three minutes before the next 30/15 block.\n\nBlock context:\nSegment: bike activity\n\nInterval:\nRest",
        duration: {
          type: "time",
          seconds: 180,
        },
        targets: [
          {
            type: "RPE",
            intensity: 1,
          },
        ],
      },
      {
        type: "repeat",
        id: "3acd14a7-ee81-485b-a235-47b46ddafb68",
        count: 10,
        steps: [
          {
            type: "step",
            id: "9300b926-df4c-4572-ab98-9023b649dc6f",
            name: "30-second Work",
            instructions:
              "Notes:\nUse a hard but repeatable aerobic-power effort; do not sprint the first repetitions.\n\nBlock context:\nSegment: bike activity\n\nInterval:\n30/15 Block 3",
            duration: {
              type: "time",
              seconds: 30,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 105,
              },
            ],
          },
          {
            type: "step",
            id: "44d76afd-f88b-4eb1-ac3f-a5127fec59c6",
            name: "15-second Recovery",
            instructions: "Notes:\nKeep pedaling very easily through the short recovery.",
            duration: {
              type: "time",
              seconds: 15,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 45,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "0a9de477-be51-482b-b205-57c47dea0b78",
        name: "Between-set Recovery",
        instructions:
          "Notes:\nPedal easily for three minutes before the next 30/15 block.\n\nBlock context:\nSegment: bike activity\n\nInterval:\nRest",
        duration: {
          type: "time",
          seconds: 180,
        },
        targets: [
          {
            type: "RPE",
            intensity: 1,
          },
        ],
      },
      {
        type: "step",
        id: "7dea57c4-319e-4b78-a552-2ec1089b7a0d",
        name: "30-second Work",
        instructions:
          "Notes:\nUse a hard but repeatable aerobic-power effort; do not sprint the first repetitions.\n\nBlock context:\nSegment: bike activity\n\nInterval:\n30/15 Block 4",
        duration: {
          type: "time",
          seconds: 30,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 105,
          },
        ],
      },
      {
        type: "step",
        id: "760950e3-c255-4c2f-8ea1-bb28e14e0774",
        name: "15-second Recovery",
        instructions: "Notes:\nKeep pedaling very easily through the short recovery.",
        duration: {
          type: "time",
          seconds: 15,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 45,
          },
        ],
      },
      {
        type: "step",
        id: "a437ca5d-58eb-4e11-8c9f-0572df4cb926",
        name: "Between-set Recovery",
        instructions:
          "Notes:\nPedal easily for three minutes before the next 30/15 block.\n\nBlock context:\nSegment: bike activity\n\nInterval:\nRest",
        duration: {
          type: "time",
          seconds: 180,
        },
        targets: [
          {
            type: "RPE",
            intensity: 1,
          },
        ],
      },
      {
        type: "step",
        id: "87f4ad1a-3ba8-41ce-af5c-8c1fb24540d3",
        name: "30-second Work",
        instructions:
          "Notes:\nUse a hard but repeatable aerobic-power effort; do not sprint the first repetitions.\n\nBlock context:\nSegment: bike activity\n\nInterval:\n30/15 Block 5",
        duration: {
          type: "time",
          seconds: 30,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 105,
          },
        ],
      },
      {
        type: "step",
        id: "a83bce61-f487-4aad-90a3-51be2b989d0a",
        name: "15-second Recovery",
        instructions: "Notes:\nKeep pedaling very easily through the short recovery.",
        duration: {
          type: "time",
          seconds: 15,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 45,
          },
        ],
      },
      {
        type: "step",
        id: "a310c936-ef5c-4582-bba8-60f38619ac3f",
        name: "Cooldown",
        instructions: "Block context:\nSegment: bike activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 50,
          },
        ],
      },
    ],
  },
  "f88b1eb1-44d7-4afd-a0f3-61ce3ba8ad1a": {
    version: 5,
    activity_category: "run",
    items: [
      {
        type: "step",
        id: "9b08c12e-e754-4d7a-8370-28bb4ee17407",
        name: "Easy Recovery Run",
        instructions:
          "Notes:\nVery easy pace - should feel relaxed and restorative\n\nBlock context:\nSegment: run activity\n\nInterval:\nEasy Recovery Run",
        duration: {
          type: "time",
          seconds: 1800,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 60,
          },
        ],
      },
    ],
  },
  "5bc881ee-a714-4d3a-8330-68fb8e21b447": {
    version: 5,
    activity_category: "run",
    items: [
      {
        type: "step",
        id: "12a5ec7f-c659-4033-aa3d-8ffcb52243b0",
        name: "Flat Warm-up",
        instructions:
          "Notes:\nStart on 0% grade, gradually increase pace\n\nBlock context:\nSegment: run activity\n\nInterval:\nFlat Warm-up",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 65,
          },
        ],
      },
      {
        type: "repeat",
        id: "28bb4ee1-7407-4a2d-9023-d13eab181d8a",
        count: 8,
        steps: [
          {
            type: "step",
            id: "37a45dca-eb58-417e-9f0c-fc8f22b5b043",
            name: "Hill Climb",
            instructions:
              "Notes:\nIncrease incline to 6-8%, maintain strong effort uphill\n\nBlock context:\nSegment: run activity\n\nInterval:\nInterval 2",
            duration: {
              type: "time",
              seconds: 120,
            },
            targets: [
              {
                type: "%ThresholdHR",
                intensity: 88,
              },
            ],
          },
          {
            type: "step",
            id: "1eb1f88b-6afd-44d7-8619-138039a65fcc",
            name: "Recovery Descent",
            instructions: "Notes:\nReturn to 0% grade, easy jog to recover",
            duration: {
              type: "time",
              seconds: 90,
            },
            targets: [
              {
                type: "%ThresholdHR",
                intensity: 65,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "a83bce61-f487-4aad-90a3-51be2b989d0a",
        name: "Cool-down",
        instructions:
          "Notes:\nFlat grade, easy pace to cool down\n\nBlock context:\nSegment: run activity\n\nInterval:\nCool-down",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 60,
          },
        ],
      },
    ],
  },
  "bc4fe275-7003-4629-94e7-ed5ac734a10e": {
    version: 5,
    activity_category: "run",
    items: [
      {
        type: "step",
        id: "a310c936-ef5c-4582-bba8-60f38619ac3f",
        name: "Easy Run",
        instructions:
          "Notes:\nShould feel comfortable and easy - you should be able to hold a conversation\n\nBlock context:\nSegment: run activity\n\nInterval:\nEasy Run",
        duration: {
          type: "time",
          seconds: 1800,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 65,
          },
        ],
      },
    ],
  },
  "239049b6-6fdc-4502-bb28-e07306992cbf": {
    version: 5,
    activity_category: "run",
    items: [
      {
        type: "step",
        id: "12a5ec7f-c659-4033-aa3d-8ffcb52243b0",
        name: "Warm-up",
        instructions:
          "Notes:\nStart easy and gradually build pace\n\nBlock context:\nSegment: run activity\n\nInterval:\nWarm-up",
        duration: {
          type: "time",
          seconds: 900,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 65,
          },
        ],
      },
      {
        type: "repeat",
        id: "009326b9-4cdf-4205-982b-990673e0e552",
        count: 6,
        steps: [
          {
            type: "step",
            id: "37a45dca-eb58-417e-9f0c-fc8f22b5b043",
            name: "5K Pace Interval",
            instructions:
              "Notes:\nRun at your 5K race pace - this should feel hard\n\nBlock context:\nSegment: run activity\n\nInterval:\nInterval 2",
            duration: {
              type: "time",
              seconds: 180,
            },
            targets: [
              {
                type: "%ThresholdHR",
                intensity: 95,
              },
            ],
          },
          {
            type: "step",
            id: "a6398013-f285-4c5f-bed1-2b9851be77e4",
            name: "Recovery Jog",
            instructions: "Notes:\nActive recovery - keep moving but very easy",
            duration: {
              type: "time",
              seconds: 120,
            },
            targets: [
              {
                type: "%ThresholdHR",
                intensity: 70,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "8013a639-cc5f-4285-98ab-1986f36065d2",
        name: "Cool-down",
        instructions:
          "Notes:\nEasy pace to bring heart rate down\n\nBlock context:\nSegment: run activity\n\nInterval:\nCool-down",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 65,
          },
        ],
      },
    ],
  },
  "26b90093-7205-4cdf-be51-ab18d13ef764": {
    version: 5,
    activity_category: "run",
    items: [
      {
        type: "step",
        id: "c12e9b08-0d7a-4754-a996-3acd14a7ee81",
        name: "Easy Start",
        instructions:
          "Notes:\nStart easy and settle into rhythm\n\nBlock context:\nSegment: run activity\n\nInterval:\nEasy Start",
        duration: {
          type: "time",
          seconds: 1800,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 65,
          },
        ],
      },
      {
        type: "step",
        id: "8a1d64f7-3ed1-48ab-b285-d744fd6a8bf8",
        name: "Steady Middle",
        instructions:
          "Notes:\nMaintain steady, comfortable effort\n\nBlock context:\nSegment: run activity\n\nInterval:\nSteady Middle",
        duration: {
          type: "time",
          seconds: 3000,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 75,
          },
        ],
      },
      {
        type: "step",
        id: "1f8c45b2-d340-4966-b724-f4871aada83b",
        name: "Easy Finish",
        instructions:
          "Notes:\nRelax and finish strong but controlled\n\nBlock context:\nSegment: run activity\n\nInterval:\nEasy Finish",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 65,
          },
        ],
      },
    ],
  },
  "6e0148db-ba4d-4427-9669-239049b66fdc": {
    version: 5,
    activity_category: "run",
    items: [
      {
        type: "step",
        id: "61ce3ba8-ad1a-47f4-8936-da6db4478e21",
        name: "Warm-up",
        instructions:
          "Notes:\nStart easy and prepare for varied efforts\n\nBlock context:\nSegment: run activity\n\nInterval:\nWarm-up",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 65,
          },
        ],
      },
      {
        type: "repeat",
        id: "33a059c6-7fec-4512-8b38-b043d669fc8f",
        count: 8,
        steps: [
          {
            type: "step",
            id: "c2559c2f-7609-40e3-9aed-ff6c2592b320",
            name: "Hard Surge",
            instructions:
              "Notes:\nSurge to hard effort - use terrain and feel\n\nBlock context:\nSegment: run activity\n\nInterval:\nInterval 2",
            duration: {
              type: "time",
              seconds: 90,
            },
            targets: [
              {
                type: "%ThresholdHR",
                intensity: 90,
              },
            ],
          },
          {
            type: "step",
            id: "95026fdc-49b6-4390-ad9a-b64990230295",
            name: "Easy Recovery",
            instructions: "Notes:\nRelax and recover between surges",
            duration: {
              type: "time",
              seconds: 150,
            },
            targets: [
              {
                type: "%ThresholdHR",
                intensity: 70,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "b320d946-ff6c-4592-8bb8-30c356e97c0f",
        name: "Cool-down",
        instructions:
          "Notes:\nEasy pace to bring heart rate down\n\nBlock context:\nSegment: run activity\n\nInterval:\nCool-down",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 65,
          },
        ],
      },
    ],
  },
  "3ed118ab-8a1d-44f7-a639-33a059c67fec": {
    version: 5,
    activity_category: "run",
    items: [
      {
        type: "step",
        id: "1582ef5c-c936-4310-ad1a-36c910a38215",
        name: "Warmup",
        instructions:
          "Notes:\nEasy warmup pace\n\nBlock context:\nSegment: run activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 65,
          },
        ],
      },
      {
        type: "step",
        id: "82155cef-36c9-40a3-9aad-3fac65d2f360",
        name: "Tempo",
        instructions:
          "Notes:\nComfortably hard tempo pace\n\nBlock context:\nSegment: run activity\n\nInterval:\nTempo",
        duration: {
          type: "time",
          seconds: 1200,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 85,
          },
        ],
      },
      {
        type: "step",
        id: "8bf8b11e-d744-4d6a-b360-d86bfe9124b7",
        name: "Cooldown",
        instructions:
          "Notes:\nEasy cool down\n\nBlock context:\nSegment: run activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 60,
          },
        ],
      },
    ],
  },
  "de71b84b-2abd-4497-86d9-53c079e69f0c": {
    version: 5,
    activity_category: "swim",
    items: [
      {
        type: "step",
        id: "f3601986-3fac-45d2-8bf8-f08316a93ccf",
        name: "Progressive Warm-up",
        instructions:
          "Notes:\nSwim 400 m easy freestyle, then build the final 100 m freestyle to prepare for speed.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nProgressive Warm-up",
        duration: {
          type: "distance",
          meters: 500,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 65,
          },
        ],
      },
      {
        type: "repeat",
        id: "d13eab18-1d8a-4764-b9a6-0a9de477be51",
        count: 8,
        steps: [
          {
            type: "step",
            id: "ca5da437-7e11-48eb-b2c5-9704bd2a4bb8",
            name: "Sprint",
            instructions:
              "Notes:\nSwim fast freestyle with a quick catch and clean body line.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nInterval 2",
            duration: {
              type: "distance",
              meters: 25,
            },
            targets: [
              {
                type: "%ThresholdHR",
                intensity: 95,
              },
            ],
          },
          {
            type: "step",
            id: "ff6c2592-b320-4946-9704-d467fa8d881b",
            name: "Recovery",
            instructions: "Notes:\nVery easy swimming or backstroke to recover",
            duration: {
              type: "distance",
              meters: 50,
            },
            targets: [
              {
                type: "%ThresholdHR",
                intensity: 60,
              },
            ],
          },
        ],
      },
      {
        type: "repeat",
        id: "ce61a83b-1aad-4487-b6c9-83f0a916cf3c",
        count: 6,
        steps: [
          {
            type: "step",
            id: "51be2b98-9d0a-47e4-b926-8a1d64f73ed1",
            name: "Longer Sprint",
            instructions:
              "Notes:\nFast but controlled effort\n\nBlock context:\nSegment: swim activity\n\nInterval:\nInterval 3",
            duration: {
              type: "distance",
              meters: 50,
            },
            targets: [
              {
                type: "%ThresholdHR",
                intensity: 90,
              },
            ],
          },
          {
            type: "step",
            id: "a437ca5d-58eb-4e11-8c9f-0572df4cb926",
            name: "Active Recovery",
            instructions: "Notes:\nEasy backstroke or freestyle",
            duration: {
              type: "distance",
              meters: 100,
            },
            targets: [
              {
                type: "%ThresholdHR",
                intensity: 60,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "18ab3ed1-64f7-4a1d-8013-016edb484dba",
        name: "Cool-down",
        instructions:
          "Notes:\nVery easy mixed strokes\n\nBlock context:\nSegment: swim activity\n\nInterval:\nCool-down",
        duration: {
          type: "distance",
          meters: 400,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 55,
          },
        ],
      },
    ],
  },
  "760950e3-c255-4c2f-8ea1-bb28e14e0774": {
    version: 5,
    activity_category: "other",
    items: [
      {
        type: "step",
        id: "55c22f9c-0976-4350-ad5a-f689d06342d5",
        name: "Warmup",
        instructions:
          "Notes:\nBegin easily and check that movement feels comfortable today.\n\nBlock context:\nSegment: other activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 360,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
      {
        type: "step",
        id: "8a1d64f7-3ed1-48ab-b285-d744fd6a8bf8",
        name: "Incline Hiking",
        instructions:
          "Notes:\nUse a grade and pack load that allow controlled foot placement; descend slowly if included.\n\nBlock context:\nSegment: other activity\n\nInterval:\nMain Set",
        duration: {
          type: "time",
          seconds: 2100,
        },
        targets: [
          {
            type: "RPE",
            intensity: 7,
          },
        ],
      },
      {
        type: "step",
        id: "2b9851be-77e4-4d0a-9300-780b9e31c457",
        name: "Cooldown",
        instructions:
          "Notes:\nEase gradually and finish with calm breathing.\n\nBlock context:\nSegment: other activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 300,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  "89f663d0-d542-4f1c-a18e-b2458c1f66f9": {
    version: 5,
    activity_category: "run",
    items: [
      {
        type: "step",
        id: "7e1158eb-ca5d-4437-a679-f36019863fac",
        name: "Warmup",
        instructions:
          "Notes:\nEase in and settle into relaxed aerobic rhythm.\n\nBlock context:\nSegment: run activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 900,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 65,
          },
        ],
      },
      {
        type: "step",
        id: "95026fdc-49b6-4390-ad9a-b64990230295",
        name: "Aerobic Settling",
        instructions:
          "Notes:\nStay smooth and controlled before race-pace work begins.\n\nBlock context:\nSegment: run activity\n\nInterval:\nAerobic Settling",
        duration: {
          type: "time",
          seconds: 2400,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 70,
          },
        ],
      },
      {
        type: "step",
        id: "4cdf7205-0093-46b9-a477-3daa1784f15e",
        name: "Marathon Pace",
        instructions:
          "Notes:\nControlled race pace with strong form and even effort.\n\nBlock context:\nSegment: run activity\n\nInterval:\nMarathon Pace",
        duration: {
          type: "time",
          seconds: 1200,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 82,
          },
        ],
      },
      {
        type: "step",
        id: "e3500976-2f9c-45c2-bbe8-20b346d96cff",
        name: "Cooldown",
        instructions:
          "Notes:\nRelax the pace and finish under control.\n\nBlock context:\nSegment: run activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 60,
          },
        ],
      },
    ],
  },
  "6dda47b4-218e-4b68-9542-5ef138cbaa3d": {
    version: 5,
    activity_category: "swim",
    items: [
      {
        type: "step",
        id: "d467fa8d-881b-4e41-bccf-f562cf3ca916",
        name: "Warmup",
        instructions:
          "Notes:\nSwim easy freestyle; use catch-up drill for the first 50 m, then settle into a long, relaxed stroke.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nWarmup",
        duration: {
          type: "distance",
          meters: 350,
        },
        targets: [
          {
            type: "RPE",
            intensity: 3,
          },
        ],
      },
      {
        type: "repeat",
        id: "b6499023-0295-4c6f-8ee1-7be8a10ec734",
        count: 4,
        steps: [
          {
            type: "step",
            id: "e956c330-35a2-4f7c-81ee-92256cff46d9",
            name: "Work",
            instructions:
              "Notes:\nCritical swim speed repeats that improve sustainable race-pace control. Hold the prescribed effort only while stroke length and breathing remain controlled.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nCSS Threshold Swim",
            duration: {
              type: "distance",
              meters: 150,
            },
            targets: [
              {
                type: "RPE",
                intensity: 7,
              },
            ],
          },
          {
            type: "step",
            id: "e0730699-2cbf-42e5-b80b-79e653c0c532",
            name: "Recovery",
            instructions:
              "Notes:\nRest at the wall; start the next repeat with calm breathing and deliberate form.",
            duration: {
              type: "time",
              seconds: 20,
            },
            targets: [
              {
                type: "rest",
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "36c910a3-8215-4cef-8e61-fb68218e47b4",
        name: "Cooldown",
        instructions:
          "Notes:\nSwim down easily and finish before technique degrades.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nCooldown",
        duration: {
          type: "distance",
          meters: 250,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  "4cdf7205-0093-46b9-a477-3daa1784f15e": {
    version: 5,
    activity_category: "run",
    items: [
      {
        type: "step",
        id: "33a059c6-7fec-4512-8b38-b043d669fc8f",
        name: "Warmup",
        instructions:
          "Notes:\nFour easy laps before the repeat set.\n\nBlock context:\nSegment: run activity\n\nInterval:\nWarmup",
        duration: {
          type: "distance",
          meters: 1600,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 65,
          },
        ],
      },
      {
        type: "repeat",
        id: "a91683f0-f562-4f3c-81ae-d265ac3f8619",
        count: 16,
        steps: [
          {
            type: "step",
            id: "f88b1eb1-44d7-4afd-a0f3-61ce3ba8ad1a",
            name: "Fast 200m",
            instructions:
              "Notes:\nFast, smooth, and controlled; keep mechanics crisp.\n\nBlock context:\nSegment: run activity\n\nInterval:\n200m Repeats",
            duration: {
              type: "distance",
              meters: 200,
            },
            targets: [
              {
                type: "RPE",
                intensity: 9,
              },
            ],
          },
          {
            type: "step",
            id: "2f9c55c2-e350-4976-8734-c457ea7d780b",
            name: "Recovery 200m",
            instructions:
              "Notes:\nJog the remaining 200 m around the track to your original starting line.",
            duration: {
              type: "distance",
              meters: 200,
            },
            targets: [
              {
                type: "RPE",
                intensity: 2,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "29960370-75e2-4fbc-812e-52e52cbf0699",
        name: "Cooldown",
        instructions: "Block context:\nSegment: run activity\n\nInterval:\nCooldown",
        duration: {
          type: "distance",
          meters: 1600,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 60,
          },
        ],
      },
    ],
  },
  "8a1d64f7-3ed1-48ab-b285-d744fd6a8bf8": {
    version: 5,
    activity_category: "run",
    items: [
      {
        type: "step",
        id: "c330e956-0f7c-45a2-9bc8-009326b94cdf",
        name: "Warmup",
        instructions:
          "Notes:\nFour easy laps with drills or strides if desired.\n\nBlock context:\nSegment: run activity\n\nInterval:\nWarmup",
        duration: {
          type: "distance",
          meters: 1600,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 65,
          },
        ],
      },
      {
        type: "repeat",
        id: "9d0a77e4-51be-4b98-8572-4ee128bb9a2d",
        count: 8,
        steps: [
          {
            type: "step",
            id: "760950e3-c255-4c2f-8ea1-bb28e14e0774",
            name: "Fast 400m",
            instructions:
              "Notes:\nOne lap at controlled 10K to 5K effort.\n\nBlock context:\nSegment: run activity\n\nInterval:\n400m Repeats",
            duration: {
              type: "distance",
              meters: 400,
            },
            targets: [
              {
                type: "RPE",
                intensity: 8,
              },
            ],
          },
          {
            type: "step",
            id: "df4c0572-9300-4926-b7e4-34c75aede87b",
            name: "Rest",
            instructions:
              "Notes:\nRest near the starting line, clear of active lanes; return to the line for the next rep.",
            duration: {
              type: "time",
              seconds: 60,
            },
            targets: [
              {
                type: "rest",
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "1d8af764-d13e-4b18-85f2-ce61a83b1aad",
        name: "Cooldown",
        instructions: "Block context:\nSegment: run activity\n\nInterval:\nCooldown",
        duration: {
          type: "distance",
          meters: 1600,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 60,
          },
        ],
      },
    ],
  },
  "85f25fcc-39a6-4380-9d8a-66f940d3b245": {
    version: 5,
    activity_category: "bike",
    items: [
      {
        type: "step",
        id: "70039629-bc4f-4275-889b-49b623909502",
        name: "Warmup",
        instructions:
          "Notes:\nBuild cadence gradually and confirm that the intended target is appropriate today.\n\nBlock context:\nSegment: bike activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 660,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 55,
          },
        ],
      },
      {
        type: "repeat",
        id: "f285cc5f-a639-4013-8a1d-ef5c1582a310",
        count: 4,
        steps: [
          {
            type: "step",
            id: "79e653c0-c532-4f0c-917e-e275bc4f9629",
            name: "Work",
            instructions:
              "Notes:\nSprint with excellent posture and fast force production; stop if power or technique deteriorates.\n\nBlock context:\nSegment: bike activity\n\nInterval:\nNeuromuscular Sprint Set",
            duration: {
              type: "time",
              seconds: 15,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 125,
              },
            ],
          },
          {
            type: "step",
            id: "e4770a9d-982b-4e51-8cdf-c5329f0c79e6",
            name: "Recovery",
            instructions:
              "Notes:\nPedal easily until breathing and movement quality are ready for the next effort.",
            duration: {
              type: "time",
              seconds: 225,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 50,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "72054cdf-26b9-4093-8a9d-6fdc95022390",
        name: "Cooldown",
        instructions:
          "Notes:\nReduce pressure progressively and finish with relaxed, smooth pedaling.\n\nBlock context:\nSegment: bike activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 540,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 50,
          },
        ],
      },
    ],
  },
  "7c0fa235-30c3-46e9-94a7-2d9a0774e14e": {
    version: 5,
    activity_category: "other",
    items: [
      {
        type: "step",
        id: "ff6c2592-b320-4946-9704-d467fa8d881b",
        name: "Trail Approach",
        instructions:
          "Notes:\nSteady pace on relatively flat or gently rolling terrain\n\nBlock context:\nSegment: other activity\n\nInterval:\nTrail Approach",
        duration: {
          type: "time",
          seconds: 1800,
        },
        targets: [
          {
            type: "%MaxHR",
            intensity: 65,
          },
        ],
      },
      {
        type: "step",
        id: "50e37609-9c2f-4255-a87b-2996037075e2",
        name: "Uphill Section",
        instructions:
          "Notes:\nSteady uphill hiking, adjust pace to maintain breathing rhythm\n\nBlock context:\nSegment: other activity\n\nInterval:\nUphill Section",
        duration: {
          type: "time",
          seconds: 2400,
        },
        targets: [
          {
            type: "%MaxHR",
            intensity: 75,
          },
        ],
      },
      {
        type: "step",
        id: "ad1a87f4-61ce-4ba8-9582-1eb1f88b6afd",
        name: "Summit Break",
        instructions:
          "Notes:\nHydrate, fuel, take photos, enjoy the accomplishment\n\nBlock context:\nSegment: other activity\n\nInterval:\nSummit Break",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "%MaxHR",
            intensity: 50,
          },
        ],
      },
      {
        type: "step",
        id: "16a9f083-62f5-4ccf-ae41-db48016e2794",
        name: "Trail Descent",
        instructions:
          "Notes:\nControl pace on downhill, focus on foot placement and knee impact\n\nBlock context:\nSegment: other activity\n\nInterval:\nTrail Descent",
        duration: {
          type: "time",
          seconds: 2400,
        },
        targets: [
          {
            type: "%MaxHR",
            intensity: 60,
          },
        ],
      },
    ],
  },
  "50e37609-9c2f-4255-a87b-2996037075e2": {
    version: 5,
    activity_category: "run",
    items: [
      {
        type: "step",
        id: "c12e9b08-0d7a-4754-a996-3acd14a7ee81",
        name: "Warmup",
        instructions:
          "Notes:\nFour easy laps before the ladder.\n\nBlock context:\nSegment: run activity\n\nInterval:\nWarmup",
        duration: {
          type: "distance",
          meters: 1600,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 65,
          },
        ],
      },
      {
        type: "step",
        id: "3ccf62f5-f083-46a9-9467-6dda47b4218e",
        name: "400m",
        instructions: "Block context:\nSegment: run activity\n\nInterval:\nLadder",
        duration: {
          type: "distance",
          meters: 400,
        },
        targets: [
          {
            type: "RPE",
            intensity: 8,
          },
        ],
      },
      {
        type: "step",
        id: "0d7ae754-c12e-4b08-b5e2-7e1158ebca5d",
        name: "Rest",
        instructions:
          "Notes:\nRest near the starting line, clear of active lanes; return to the line for the next rep.",
        duration: {
          type: "time",
          seconds: 90,
        },
        targets: [
          {
            type: "rest",
          },
        ],
      },
      {
        type: "step",
        id: "2ec1089b-7a0d-44e7-9629-63d089f6af1c",
        name: "800m",
        duration: {
          type: "distance",
          meters: 800,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 88,
          },
        ],
      },
      {
        type: "step",
        id: "17843daa-cb38-415e-bfec-5cef821510a3",
        name: "Rest",
        instructions:
          "Notes:\nRest near the starting line, clear of active lanes; return to the line for the next rep.",
        duration: {
          type: "time",
          seconds: 90,
        },
        targets: [
          {
            type: "rest",
          },
        ],
      },
      {
        type: "step",
        id: "60f38619-ac3f-4265-b88b-f966d34045b2",
        name: "1200m",
        duration: {
          type: "distance",
          meters: 1200,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 88,
          },
        ],
      },
      {
        type: "step",
        id: "91fe6bd8-dd4a-4724-b966-4add24b7fe91",
        name: "Recovery 400m",
        duration: {
          type: "distance",
          meters: 400,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
      {
        type: "step",
        id: "72054cdf-26b9-4093-8a9d-6fdc95022390",
        name: "1600m",
        duration: {
          type: "distance",
          meters: 1600,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 86,
          },
        ],
      },
      {
        type: "step",
        id: "cb38f15e-1784-4daa-b3a0-982bbe51e477",
        name: "Recovery 400m",
        duration: {
          type: "distance",
          meters: 400,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
      {
        type: "step",
        id: "24b74add-d86b-4e91-8c1f-85f25fcc39a6",
        name: "1200m",
        duration: {
          type: "distance",
          meters: 1200,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 88,
          },
        ],
      },
      {
        type: "step",
        id: "95026fdc-49b6-4390-ad9a-b64990230295",
        name: "Rest",
        instructions:
          "Notes:\nRest near the starting line, clear of active lanes; return to the line for the next rep.",
        duration: {
          type: "time",
          seconds: 90,
        },
        targets: [
          {
            type: "rest",
          },
        ],
      },
      {
        type: "step",
        id: "77e49d0a-2b98-41be-9f4c-bc4fe2757003",
        name: "800m",
        duration: {
          type: "distance",
          meters: 800,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 90,
          },
        ],
      },
      {
        type: "step",
        id: "0ea1e87b-5aed-44c7-b609-43b069d68ffc",
        name: "Rest",
        instructions:
          "Notes:\nRest near the starting line, clear of active lanes; return to the line for the next rep.",
        duration: {
          type: "time",
          seconds: 90,
        },
        targets: [
          {
            type: "rest",
          },
        ],
      },
      {
        type: "step",
        id: "ed5ac734-a10e-4be8-95c2-de71b84b2abd",
        name: "400m",
        duration: {
          type: "distance",
          meters: 400,
        },
        targets: [
          {
            type: "RPE",
            intensity: 9,
          },
        ],
      },
      {
        type: "step",
        id: "2b9851be-77e4-4d0a-9300-780b9e31c457",
        name: "Cooldown",
        instructions: "Block context:\nSegment: run activity\n\nInterval:\nCooldown",
        duration: {
          type: "distance",
          meters: 1600,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 60,
          },
        ],
      },
    ],
  },
  "b043d669-fc8f-42b5-88db-0976e35055c2": {
    version: 5,
    activity_category: "other",
    items: [
      {
        type: "step",
        id: "33a059c6-7fec-4512-8b38-b043d669fc8f",
        name: "General Warm-up",
        instructions:
          "Notes:\nRow/bike, dynamic stretching, movement prep\n\nBlock context:\nSegment: other activity\n\nInterval:\nGeneral Warm-up",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "%MaxHR",
            intensity: 65,
          },
        ],
      },
      {
        type: "step",
        id: "d467fa8d-881b-4e41-bccf-f562cf3ca916",
        name: "Specific Warm-up",
        instructions:
          "Notes:\nPractice WOD movements at light weight/modified versions\n\nBlock context:\nSegment: other activity\n\nInterval:\nSpecific Warm-up",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "%MaxHR",
            intensity: 70,
          },
        ],
      },
      {
        type: "step",
        id: "41ae1b88-8dfa-47d4-a916-ba4d94276e01",
        name: "Main WOD",
        instructions:
          "Notes:\nAMRAP, EMOM, or time-based activity - push hard but maintain form\n\nBlock context:\nSegment: other activity\n\nInterval:\nMain WOD",
        duration: {
          type: "time",
          seconds: 900,
        },
        targets: [
          {
            type: "%MaxHR",
            intensity: 88,
          },
        ],
      },
      {
        type: "step",
        id: "92256cff-46d9-40b3-aabd-0f7c35a2c330",
        name: "Cool-down & Mobility",
        instructions:
          "Notes:\nEasy movement, static stretching, foam rolling\n\nBlock context:\nSegment: other activity\n\nInterval:\nCool-down & Mobility",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "%MaxHR",
            intensity: 50,
          },
        ],
      },
    ],
  },
  "c734ed5a-7be8-410e-af9c-4cdf72050093": {
    version: 5,
    activity_category: "bike",
    items: [
      {
        type: "step",
        id: "5cef8215-10a3-46c9-b487-0d7ae754c12e",
        name: "Warm-up",
        instructions:
          "Notes:\nStart easy and gradually build intensity\n\nBlock context:\nSegment: bike activity\n\nInterval:\nWarm-up",
        duration: {
          type: "time",
          seconds: 900,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 55,
          },
        ],
      },
      {
        type: "repeat",
        id: "a6398013-f285-4c5f-bed1-2b9851be77e4",
        count: 3,
        steps: [
          {
            type: "step",
            id: "9b08c12e-e754-4d7a-8370-28bb4ee17407",
            name: "Sweet Spot Interval",
            instructions:
              "Notes:\nMaintain steady power in sweet spot zone (85-90% FTP)\n\nBlock context:\nSegment: bike activity\n\nInterval:\nInterval 2",
            duration: {
              type: "time",
              seconds: 900,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 88,
              },
            ],
          },
          {
            type: "step",
            id: "a033c659-ec7f-42a5-b8cb-b92693000572",
            name: "Easy Recovery",
            instructions: "Notes:\nEasy spinning to recover between intervals",
            duration: {
              type: "time",
              seconds: 300,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 50,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "26b90093-7205-4cdf-be51-ab18d13ef764",
        name: "Cool-down",
        instructions:
          "Notes:\nEasy spinning to bring heart rate down\n\nBlock context:\nSegment: bike activity\n\nInterval:\nCool-down",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 50,
          },
        ],
      },
    ],
  },
  "34c75aed-e87b-4ea1-9c2f-d542af1c89f6": {
    version: 5,
    activity_category: "bike",
    items: [
      {
        type: "step",
        id: "ad1a87f4-61ce-4ba8-9582-1eb1f88b6afd",
        name: "Progressive Warm-up",
        instructions:
          "Notes:\nGradually increase effort to prepare for tempo work\n\nBlock context:\nSegment: bike activity\n\nInterval:\nProgressive Warm-up",
        duration: {
          type: "time",
          seconds: 1200,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 60,
          },
        ],
      },
      {
        type: "step",
        id: "e87b0ea1-34c7-4aed-90e3-117eeb585dca",
        name: "Tempo Block 1",
        instructions:
          "Notes:\nSteady tempo effort - should feel moderately hard but sustainable\n\nBlock context:\nSegment: bike activity\n\nInterval:\nTempo Block 1",
        duration: {
          type: "time",
          seconds: 1200,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 78,
          },
        ],
      },
      {
        type: "step",
        id: "47b46dda-fb68-418e-af1c-cc5ff2858013",
        name: "Easy Recovery",
        instructions:
          "Notes:\nEasy spinning to recover\n\nBlock context:\nSegment: bike activity\n\nInterval:\nEasy Recovery",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 55,
          },
        ],
      },
      {
        type: "step",
        id: "12a5ec7f-c659-4033-aa3d-8ffcb52243b0",
        name: "Tempo Block 2",
        instructions:
          "Notes:\nMaintain same effort as first block\n\nBlock context:\nSegment: bike activity\n\nInterval:\nTempo Block 2",
        duration: {
          type: "time",
          seconds: 1200,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 78,
          },
        ],
      },
      {
        type: "step",
        id: "51be2b98-9d0a-47e4-b926-8a1d64f73ed1",
        name: "Cool-down",
        instructions:
          "Notes:\nEasy spinning to normalize heart rate\n\nBlock context:\nSegment: bike activity\n\nInterval:\nCool-down",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 50,
          },
        ],
      },
    ],
  },
  "0699e073-52e5-4cbf-9e31-0b78319e57c4": {
    version: 5,
    activity_category: "run",
    items: [
      {
        type: "step",
        id: "c5329f0c-79e6-43c0-9dca-26b900937205",
        name: "Warmup",
        instructions:
          "Notes:\nJog easily and include mobility drills before faster running.\n\nBlock context:\nSegment: run activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 720,
        },
        targets: [
          {
            type: "RPE",
            intensity: 3,
          },
        ],
      },
      {
        type: "step",
        id: "12a5ec7f-c659-4033-aa3d-8ffcb52243b0",
        name: "Easy Reset Run",
        instructions:
          "Notes:\nKeep breathing controlled and stop early if gait changes.\n\nBlock context:\nSegment: run activity\n\nInterval:\nMain Set",
        duration: {
          type: "time",
          seconds: 1200,
        },
        targets: [
          {
            type: "RPE",
            intensity: 3,
          },
        ],
      },
      {
        type: "step",
        id: "17843daa-cb38-415e-bfec-5cef821510a3",
        name: "Cooldown",
        instructions:
          "Notes:\nJog easily, then walk until breathing settles.\n\nBlock context:\nSegment: run activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  "0a9de477-be51-482b-b205-57c47dea0b78": {
    version: 5,
    activity_category: "bike",
    items: [
      {
        type: "step",
        id: "c5329f0c-79e6-43c0-9dca-26b900937205",
        name: "Warmup",
        instructions:
          "Notes:\nStart relaxed and build cadence smoothly.\n\nBlock context:\nSegment: bike activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 900,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 58,
          },
        ],
      },
      {
        type: "step",
        id: "ae41881b-fa8d-4467-96a9-e35009762f9c",
        name: "Settled Endurance",
        instructions:
          "Notes:\nLock into conversational endurance riding.\n\nBlock context:\nSegment: bike activity\n\nInterval:\nSettled Endurance",
        duration: {
          type: "time",
          seconds: 3300,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 68,
          },
        ],
      },
      {
        type: "repeat",
        id: "ba4d9427-6e01-48db-a2b5-c734ed5a7be8",
        count: 2,
        steps: [
          {
            type: "step",
            id: "d744fd6a-8bf8-411e-bfac-9c2fc25550e3",
            name: "Tempo Lift",
            instructions:
              "Notes:\nRaise pressure without drifting above controlled tempo.\n\nBlock context:\nSegment: bike activity\n\nInterval:\nProgressive Lift",
            duration: {
              type: "time",
              seconds: 600,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 76,
              },
            ],
          },
          {
            type: "step",
            id: "ec7f12a5-a033-4659-8417-5dca37a4117e",
            name: "Easy Reset",
            instructions: "Notes:\nRecover while keeping pedals moving.",
            duration: {
              type: "time",
              seconds: 480,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 60,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "28bb4ee1-7407-4a2d-9023-d13eab181d8a",
        name: "Steady Finish",
        instructions:
          "Notes:\nFinish with durable aerobic pressure, not a fade.\n\nBlock context:\nSegment: bike activity\n\nInterval:\nSteady Finish",
        duration: {
          type: "time",
          seconds: 1500,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 70,
          },
        ],
      },
      {
        type: "step",
        id: "f966d340-45b2-4f8c-91fe-62f53ccf16a9",
        name: "Cooldown",
        instructions:
          "Notes:\nSpin out the legs before ending the ride.\n\nBlock context:\nSegment: bike activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 480,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 55,
          },
        ],
      },
    ],
  },
  "52e52cbf-0699-4073-aa7d-4fbc75e20370": {
    version: 5,
    activity_category: "bike",
    items: [
      {
        type: "step",
        id: "239049b6-6fdc-4502-bb28-e07306992cbf",
        name: "Warmup",
        instructions:
          "Notes:\nBuild cadence gradually and confirm that the intended target is appropriate today.\n\nBlock context:\nSegment: bike activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 660,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 55,
          },
        ],
      },
      {
        type: "step",
        id: "2ec1089b-7a0d-44e7-9629-63d089f6af1c",
        name: "Recovery Spin",
        instructions:
          "Notes:\nKeep pressure light, cadence fluid, and breathing completely conversational.\n\nBlock context:\nSegment: bike activity\n\nInterval:\nMain Set",
        duration: {
          type: "time",
          seconds: 2100,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 50,
          },
        ],
      },
      {
        type: "step",
        id: "a10e7be8-ed5a-4734-8976-9a2d74074ee1",
        name: "Cooldown",
        instructions:
          "Notes:\nReduce pressure progressively and finish with relaxed, smooth pedaling.\n\nBlock context:\nSegment: bike activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 540,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 50,
          },
        ],
      },
    ],
  },
  "7be8a10e-c734-4d5a-a350-089b2ec154e7": {
    version: 5,
    activity_category: "bike",
    items: [
      {
        type: "step",
        id: "04972abd-b84b-4e71-acff-e552bf2c9906",
        name: "Warmup",
        instructions:
          "Notes:\nBuild cadence gradually and confirm that the intended target is appropriate today.\n\nBlock context:\nSegment: bike activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 660,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 55,
          },
        ],
      },
      {
        type: "step",
        id: "17843daa-cb38-415e-bfec-5cef821510a3",
        name: "Aerobic Durability Ride",
        instructions:
          "Notes:\nHold even pressure and finish with the same relaxed posture used at the start.\n\nBlock context:\nSegment: bike activity\n\nInterval:\nMain Set",
        duration: {
          type: "time",
          seconds: 4200,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 68,
          },
        ],
      },
      {
        type: "step",
        id: "32c50c9f-e679-4053-8a5d-af1cd54263d0",
        name: "Cooldown",
        instructions:
          "Notes:\nReduce pressure progressively and finish with relaxed, smooth pedaling.\n\nBlock context:\nSegment: bike activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 540,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 50,
          },
        ],
      },
    ],
  },
  "3fac65d2-f360-4986-9744-9427ba4d48db": {
    version: 5,
    activity_category: "bike",
    items: [
      {
        type: "step",
        id: "ae41881b-fa8d-4467-96a9-e35009762f9c",
        name: "Warmup",
        instructions:
          "Notes:\nBuild cadence gradually and confirm that the intended target is appropriate today.\n\nBlock context:\nSegment: bike activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 660,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 55,
          },
        ],
      },
      {
        type: "repeat",
        id: "b84bde71-0497-4abd-a0b3-a10e7be8ed5a",
        count: 4,
        steps: [
          {
            type: "step",
            id: "1b8841ae-67d4-4dfa-83f0-a83bce61f487",
            name: "Work",
            instructions:
              "Notes:\nSettle quickly, keep cadence stable, and avoid power spikes at the start of each interval.\n\nBlock context:\nSegment: bike activity\n\nInterval:\nTempo Control Intervals",
            duration: {
              type: "time",
              seconds: 600,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 80,
              },
            ],
          },
          {
            type: "step",
            id: "9a2d7407-4ee1-48bb-8295-a714cd3a5bc8",
            name: "Recovery",
            instructions:
              "Notes:\nPedal easily until breathing and movement quality are ready for the next effort.",
            duration: {
              type: "time",
              seconds: 240,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 50,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "38cb5ef1-8417-4a3d-a033-218efb686dda",
        name: "Cooldown",
        instructions:
          "Notes:\nReduce pressure progressively and finish with relaxed, smooth pedaling.\n\nBlock context:\nSegment: bike activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 540,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 50,
          },
        ],
      },
    ],
  },
  "bb28e14e-0774-4d9a-a390-c85bee8114a7": {
    version: 5,
    activity_category: "bike",
    items: [
      {
        type: "step",
        id: "46d920b3-9225-4cff-9e71-cb38f15e1784",
        name: "Warmup",
        instructions:
          "Notes:\nBuild cadence gradually and confirm that the intended target is appropriate today.\n\nBlock context:\nSegment: bike activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 660,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 55,
          },
        ],
      },
      {
        type: "repeat",
        id: "d063f689-1caf-42d5-a8fb-a91683f0f562",
        count: 4,
        steps: [
          {
            type: "step",
            id: "ef5c1582-a310-4936-87f4-04972abdb84b",
            name: "Work",
            instructions:
              "Notes:\nRide close to threshold with controlled breathing and repeatable power through the final interval.\n\nBlock context:\nSegment: bike activity\n\nInterval:\nThreshold Power Intervals",
            duration: {
              type: "time",
              seconds: 480,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 92,
              },
            ],
          },
          {
            type: "step",
            id: "da6db447-8e21-48fb-82d5-67d48dfa1b88",
            name: "Recovery",
            instructions:
              "Notes:\nPedal easily until breathing and movement quality are ready for the next effort.",
            duration: {
              type: "time",
              seconds: 240,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 50,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "50e37609-9c2f-4255-a87b-2996037075e2",
        name: "Cooldown",
        instructions:
          "Notes:\nReduce pressure progressively and finish with relaxed, smooth pedaling.\n\nBlock context:\nSegment: bike activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 540,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 50,
          },
        ],
      },
    ],
  },
  "0ea1e87b-5aed-44c7-b609-43b069d68ffc": {
    version: 5,
    activity_category: "bike",
    items: [
      {
        type: "step",
        id: "cb38f15e-1784-4daa-b3a0-982bbe51e477",
        name: "Warmup",
        instructions:
          "Notes:\nBuild cadence gradually and confirm that the intended target is appropriate today.\n\nBlock context:\nSegment: bike activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 660,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 55,
          },
        ],
      },
      {
        type: "repeat",
        id: "89f663d0-d542-4f1c-a18e-b2458c1f66f9",
        count: 4,
        steps: [
          {
            type: "step",
            id: "52e52cbf-0699-4073-aa7d-4fbc75e20370",
            name: "Work",
            instructions:
              "Notes:\nAccelerate decisively, then hold form and torque without fading through the final seconds.\n\nBlock context:\nSegment: bike activity\n\nInterval:\nAnaerobic Repeatability",
            duration: {
              type: "time",
              seconds: 90,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 110,
              },
            ],
          },
          {
            type: "step",
            id: "ef5c1582-a310-4936-87f4-04972abdb84b",
            name: "Recovery",
            instructions:
              "Notes:\nPedal easily until breathing and movement quality are ready for the next effort.",
            duration: {
              type: "time",
              seconds: 180,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 50,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "0976e350-55c2-4f9c-a10e-32c50c9fe679",
        name: "Cooldown",
        instructions:
          "Notes:\nReduce pressure progressively and finish with relaxed, smooth pedaling.\n\nBlock context:\nSegment: bike activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 540,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 50,
          },
        ],
      },
    ],
  },
  "b320d946-ff6c-4592-8bb8-30c356e97c0f": {
    version: 5,
    activity_category: "bike",
    items: [
      {
        type: "step",
        id: "861960f3-d265-4c3f-9eb1-8bf8b11ed744",
        name: "Warmup",
        instructions:
          "Notes:\nBuild cadence gradually and confirm that the intended target is appropriate today.\n\nBlock context:\nSegment: bike activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 660,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 55,
          },
        ],
      },
      {
        type: "repeat",
        id: "7c0fa235-30c3-46e9-94a7-2d9a0774e14e",
        count: 4,
        steps: [
          {
            type: "step",
            id: "07742d9a-bb28-414e-afdc-0c9f32c5c053",
            name: "Work",
            instructions:
              "Notes:\nHold a smooth, even pedal stroke while maintaining aerobic pressure.\n\nBlock context:\nSegment: bike activity\n\nInterval:\nCadence Endurance Blocks",
            duration: {
              type: "time",
              seconds: 480,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 70,
              },
              {
                type: "cadence",
                intensity: 90,
              },
            ],
          },
          {
            type: "step",
            id: "ba4d9427-6e01-48db-a2b5-c734ed5a7be8",
            name: "Recovery",
            instructions:
              "Notes:\nPedal easily until breathing and movement quality are ready for the next effort.",
            duration: {
              type: "time",
              seconds: 180,
            },
            targets: [
              {
                type: "%FTP",
                intensity: 50,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "fc8f22b5-b043-4669-9427-ad1a87f461ce",
        name: "Cooldown",
        instructions:
          "Notes:\nReduce pressure progressively and finish with relaxed, smooth pedaling.\n\nBlock context:\nSegment: bike activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 540,
        },
        targets: [
          {
            type: "%FTP",
            intensity: 50,
          },
        ],
      },
    ],
  },
  "0c9f32c5-c053-4679-a437-7dea57c4319e": {
    version: 5,
    activity_category: "swim",
    items: [
      {
        type: "step",
        id: "53c079e6-9f0c-4532-ab58-d063f6891caf",
        name: "Warmup",
        instructions:
          "Notes:\nSwim easy freestyle; use catch-up drill for the first 50 m, then settle into a long, relaxed stroke.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nWarmup",
        duration: {
          type: "distance",
          meters: 350,
        },
        targets: [
          {
            type: "RPE",
            intensity: 3,
          },
        ],
      },
      {
        type: "repeat",
        id: "0d7ae754-c12e-4b08-b5e2-7e1158ebca5d",
        count: 4,
        steps: [
          {
            type: "step",
            id: "30c356e9-7c0f-4235-885b-89f663d0d542",
            name: "Work",
            instructions:
              "Notes:\nTempo repeats that finish faster than they begin, teaching controlled pressure and a patient first half. Hold the prescribed effort only while stroke length and breathing remain controlled.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nTempo Negative-Split Swim",
            duration: {
              type: "distance",
              meters: 250,
            },
            targets: [
              {
                type: "RPE",
                intensity: 6,
              },
            ],
          },
          {
            type: "step",
            id: "87f4ad1a-3ba8-41ce-af5c-8c1fb24540d3",
            name: "Recovery",
            instructions:
              "Notes:\nRest at the wall; start the next repeat with calm breathing and deliberate form.",
            duration: {
              type: "time",
              seconds: 25,
            },
            targets: [
              {
                type: "rest",
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "8dfa67d4-41ae-4b88-b562-fe91d86b4add",
        name: "Cooldown",
        instructions:
          "Notes:\nSwim down easily and finish before technique degrades.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nCooldown",
        duration: {
          type: "distance",
          meters: 250,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  "da6db447-8e21-48fb-82d5-67d48dfa1b88": {
    version: 5,
    activity_category: "run",
    items: [
      {
        type: "step",
        id: "a91683f0-f562-4f3c-81ae-d265ac3f8619",
        name: "Warmup",
        instructions:
          "Notes:\nJog easily and include mobility drills before faster running.\n\nBlock context:\nSegment: run activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 720,
        },
        targets: [
          {
            type: "RPE",
            intensity: 3,
          },
        ],
      },
      {
        type: "repeat",
        id: "cb38f15e-1784-4daa-b3a0-982bbe51e477",
        count: 4,
        steps: [
          {
            type: "step",
            id: "9e31780b-ea7d-4457-8699-9300b926df4c",
            name: "Work",
            instructions:
              "Notes:\nShort hill surges that develop repeatable anaerobic power with full form-focused recovery. Run tall and controlled; preserve the same mechanics through every repetition.\n\nBlock context:\nSegment: run activity\n\nInterval:\nAnaerobic Hill Surges",
            duration: {
              type: "time",
              seconds: 45,
            },
            targets: [
              {
                type: "RPE",
                intensity: 9,
              },
            ],
          },
          {
            type: "step",
            id: "9d0a77e4-51be-4b98-8572-4ee128bb9a2d",
            name: "Recovery",
            instructions:
              "Notes:\nWalk or jog gently downhill. Start the next surge only with controlled breathing and stable form; extend recovery if needed.",
            duration: {
              type: "time",
              seconds: 125,
            },
            targets: [
              {
                type: "RPE",
                intensity: 2,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "4bb871de-9704-4d2a-b320-18ab3ed164f7",
        name: "Cooldown",
        instructions:
          "Notes:\nJog easily, then walk until breathing settles.\n\nBlock context:\nSegment: run activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  "51be2b98-9d0a-47e4-b926-8a1d64f73ed1": {
    version: 5,
    activity_category: "run",
    items: [
      {
        type: "step",
        id: "26b90093-7205-4cdf-be51-ab18d13ef764",
        name: "Warmup",
        instructions:
          "Notes:\nJog easily and include mobility drills before faster running.\n\nBlock context:\nSegment: run activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 720,
        },
        targets: [
          {
            type: "RPE",
            intensity: 3,
          },
        ],
      },
      {
        type: "repeat",
        id: "e0730699-2cbf-42e5-b80b-79e653c0c532",
        count: 4,
        steps: [
          {
            type: "step",
            id: "dd4ab724-91fe-4bd8-85b2-0ea1e87b5aed",
            name: "Work",
            instructions:
              "Notes:\nBrief relaxed strides that sharpen coordination and leg speed without accumulating lactate. Run tall and controlled; preserve the same mechanics through every repetition.\n\nBlock context:\nSegment: run activity\n\nInterval:\nNeuromuscular Strides",
            duration: {
              type: "time",
              seconds: 20,
            },
            targets: [
              {
                type: "RPE",
                intensity: 9,
              },
            ],
          },
          {
            type: "step",
            id: "52e52cbf-0699-4073-aa7d-4fbc75e20370",
            name: "Recovery",
            instructions:
              "Notes:\nWalk or jog very easily until breathing settles. Keep each stride relaxed and quick; extend recovery rather than sprinting fatigued.",
            duration: {
              type: "time",
              seconds: 90,
            },
            targets: [
              {
                type: "RPE",
                intensity: 2,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "60f38619-ac3f-4265-b88b-f966d34045b2",
        name: "Cooldown",
        instructions:
          "Notes:\nJog easily, then walk until breathing settles.\n\nBlock context:\nSegment: run activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  "fe91d86b-4add-44b7-a6f9-73e09906bf2c": {
    version: 5,
    activity_category: "swim",
    items: [
      {
        type: "step",
        id: "ef5c1582-a310-4936-87f4-04972abdb84b",
        name: "Warmup",
        instructions:
          "Notes:\nSwim easy freestyle; use catch-up drill for the first 50 m, then settle into a long, relaxed stroke.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nWarmup",
        duration: {
          type: "distance",
          meters: 350,
        },
        targets: [
          {
            type: "RPE",
            intensity: 3,
          },
        ],
      },
      {
        type: "repeat",
        id: "91fe6bd8-dd4a-4724-b966-4add24b7fe91",
        count: 4,
        steps: [
          {
            type: "step",
            id: "f285cc5f-a639-4013-8a1d-ef5c1582a310",
            name: "Work",
            instructions:
              "Notes:\nEasy swimming that restores feel for the water and relaxed alignment. Hold the prescribed effort only while stroke length and breathing remain controlled.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nRecovery Feel Swim",
            duration: {
              type: "distance",
              meters: 200,
            },
            targets: [
              {
                type: "RPE",
                intensity: 3,
              },
            ],
          },
          {
            type: "step",
            id: "53c079e6-9f0c-4532-ab58-d063f6891caf",
            name: "Recovery",
            instructions:
              "Notes:\nRest at the wall; start the next repeat with calm breathing and deliberate form.",
            duration: {
              type: "time",
              seconds: 15,
            },
            targets: [
              {
                type: "rest",
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "117eeb58-5dca-47a4-b9e6-ca5da4377e11",
        name: "Cooldown",
        instructions:
          "Notes:\nSwim down easily and finish before technique degrades.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nCooldown",
        duration: {
          type: "distance",
          meters: 250,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  "6afd44d7-1eb1-488b-9265-b724dd4a6bd8": {
    version: 5,
    activity_category: "swim",
    items: [
      {
        type: "step",
        id: "2d9a0774-e14e-4b28-9502-9e31780bea7d",
        name: "Warmup",
        instructions:
          "Notes:\nSwim easy freestyle; use catch-up drill for the first 50 m, then settle into a long, relaxed stroke.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nWarmup",
        duration: {
          type: "distance",
          meters: 350,
        },
        targets: [
          {
            type: "RPE",
            intensity: 3,
          },
        ],
      },
      {
        type: "repeat",
        id: "e3500976-2f9c-45c2-bbe8-20b346d96cff",
        count: 4,
        steps: [
          {
            type: "step",
            id: "66f940d3-b245-4c1f-be91-6bd891feb724",
            name: "Work",
            instructions:
              "Notes:\nContinuous aerobic repeats that develop economical, repeatable freestyle. Hold the prescribed effort only while stroke length and breathing remain controlled.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nAerobic Continuity Swim",
            duration: {
              type: "distance",
              meters: 400,
            },
            targets: [
              {
                type: "RPE",
                intensity: 5,
              },
            ],
          },
          {
            type: "step",
            id: "e956c330-35a2-4f7c-81ee-92256cff46d9",
            name: "Recovery",
            instructions:
              "Notes:\nRest at the wall; start the next repeat with calm breathing and deliberate form.",
            duration: {
              type: "time",
              seconds: 25,
            },
            targets: [
              {
                type: "rest",
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "63d089f6-af1c-4542-bb68-a033c659ec7f",
        name: "Cooldown",
        instructions:
          "Notes:\nSwim down easily and finish before technique degrades.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nCooldown",
        duration: {
          type: "distance",
          meters: 250,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  "35a20f7c-e956-4330-8d3a-d669b04322b5": {
    version: 5,
    activity_category: "swim",
    items: [
      {
        type: "step",
        id: "fe91d86b-4add-44b7-a6f9-73e09906bf2c",
        name: "Warmup",
        instructions:
          "Notes:\nSwim easy freestyle; use catch-up drill for the first 50 m, then settle into a long, relaxed stroke.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nWarmup",
        duration: {
          type: "distance",
          meters: 350,
        },
        targets: [
          {
            type: "RPE",
            intensity: 3,
          },
        ],
      },
      {
        type: "repeat",
        id: "70039629-bc4f-4275-889b-49b623909502",
        count: 4,
        steps: [
          {
            type: "step",
            id: "49b62390-9502-4fdc-a14e-f285cc5fa639",
            name: "Work",
            instructions:
              "Notes:\nControlled pull buoy tempo repeats that reinforce a firm catch and steady pressure. Hold the prescribed effort only while stroke length and breathing remain controlled.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nTempo Pull Set",
            duration: {
              type: "distance",
              meters: 200,
            },
            targets: [
              {
                type: "RPE",
                intensity: 6,
              },
            ],
          },
          {
            type: "step",
            id: "82155cef-36c9-40a3-9aad-3fac65d2f360",
            name: "Recovery",
            instructions:
              "Notes:\nRest at the wall; start the next repeat with calm breathing and deliberate form.",
            duration: {
              type: "time",
              seconds: 20,
            },
            targets: [
              {
                type: "rest",
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "f08316a9-3ccf-42f5-881b-c936a3101582",
        name: "Cooldown",
        instructions:
          "Notes:\nSwim down easily and finish before technique degrades.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nCooldown",
        duration: {
          type: "distance",
          meters: 250,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  "49b62390-9502-4fdc-a14e-f285cc5fa639": {
    version: 5,
    activity_category: "swim",
    items: [
      {
        type: "step",
        id: "16a9f083-62f5-4ccf-ae41-db48016e2794",
        name: "Warmup",
        instructions:
          "Notes:\nSwim easy freestyle; use catch-up drill for the first 50 m, then settle into a long, relaxed stroke.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nWarmup",
        duration: {
          type: "distance",
          meters: 350,
        },
        targets: [
          {
            type: "RPE",
            intensity: 3,
          },
        ],
      },
      {
        type: "repeat",
        id: "9427ba4d-48db-4e01-bc8f-35a20f7ce956",
        count: 4,
        steps: [
          {
            type: "step",
            id: "dd4ab724-91fe-4bd8-85b2-0ea1e87b5aed",
            name: "Work",
            instructions:
              "Notes:\nHard 100-metre repeats that raise aerobic power while preserving stroke length. Hold the prescribed effort only while stroke length and breathing remain controlled.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nVO2 Pace Swim",
            duration: {
              type: "distance",
              meters: 100,
            },
            targets: [
              {
                type: "RPE",
                intensity: 8,
              },
            ],
          },
          {
            type: "step",
            id: "aa3d8417-5ef1-48cb-92a5-77e49d0a2b98",
            name: "Recovery",
            instructions:
              "Notes:\nRest at the wall; start the next repeat with calm breathing and deliberate form.",
            duration: {
              type: "time",
              seconds: 30,
            },
            targets: [
              {
                type: "rest",
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "14a73acd-c85b-4e81-bc0f-b5228ffc69d6",
        name: "Cooldown",
        instructions:
          "Notes:\nSwim down easily and finish before technique degrades.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nCooldown",
        duration: {
          type: "distance",
          meters: 250,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  "2f9c55c2-e350-4976-8734-c457ea7d780b": {
    version: 5,
    activity_category: "swim",
    items: [
      {
        type: "step",
        id: "36c910a3-8215-4cef-8e61-fb68218e47b4",
        name: "Warmup",
        instructions:
          "Notes:\nSwim easy freestyle; use catch-up drill for the first 50 m, then settle into a long, relaxed stroke.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nWarmup",
        duration: {
          type: "distance",
          meters: 350,
        },
        targets: [
          {
            type: "RPE",
            intensity: 3,
          },
        ],
      },
      {
        type: "repeat",
        id: "c85bee81-14a7-4acd-b0c3-71de4bb8bd2a",
        count: 4,
        steps: [
          {
            type: "step",
            id: "e3500976-2f9c-45c2-bbe8-20b346d96cff",
            name: "Work",
            instructions:
              "Notes:\nShort 50-metre efforts that develop repeatable speed with enough rest to protect technique. Hold the prescribed effort only while stroke length and breathing remain controlled.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nAnaerobic 50s",
            duration: {
              type: "distance",
              meters: 50,
            },
            targets: [
              {
                type: "RPE",
                intensity: 9,
              },
            ],
          },
          {
            type: "step",
            id: "6afd44d7-1eb1-488b-9265-b724dd4a6bd8",
            name: "Recovery",
            instructions:
              "Notes:\nRest at the wall; start the next repeat with calm breathing and deliberate form.",
            duration: {
              type: "time",
              seconds: 70,
            },
            targets: [
              {
                type: "rest",
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "48db6e01-9427-4a4d-b043-f15ecb383daa",
        name: "Cooldown",
        instructions:
          "Notes:\nSwim down easily and finish before technique degrades.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nCooldown",
        duration: {
          type: "distance",
          meters: 250,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  "4add24b7-fe91-486b-b245-17843daacb38": {
    version: 5,
    activity_category: "swim",
    items: [
      {
        type: "step",
        id: "bb28e14e-0774-4d9a-a390-c85bee8114a7",
        name: "Warmup",
        instructions:
          "Notes:\nSwim easy freestyle; use catch-up drill for the first 50 m, then settle into a long, relaxed stroke.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nWarmup",
        duration: {
          type: "distance",
          meters: 350,
        },
        targets: [
          {
            type: "RPE",
            intensity: 3,
          },
        ],
      },
      {
        type: "repeat",
        id: "d542af1c-89f6-43d0-adda-760950e3c255",
        count: 4,
        steps: [
          {
            type: "step",
            id: "d669b043-22b5-4c8f-ae01-1b8841ae67d4",
            name: "Work",
            instructions:
              "Notes:\nBrief 25-metre accelerations that sharpen stroke timing with complete quality recovery. Hold the prescribed effort only while stroke length and breathing remain controlled.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nNeuromuscular 25s",
            duration: {
              type: "distance",
              meters: 25,
            },
            targets: [
              {
                type: "RPE",
                intensity: 9,
              },
            ],
          },
          {
            type: "step",
            id: "77e49d0a-2b98-41be-9f4c-bc4fe2757003",
            name: "Recovery",
            instructions:
              "Notes:\nRest at the wall; start the next repeat with calm breathing and deliberate form.",
            duration: {
              type: "time",
              seconds: 85,
            },
            targets: [
              {
                type: "rest",
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "55c22f9c-0976-4350-ad5a-f689d06342d5",
        name: "Cooldown",
        instructions:
          "Notes:\nSwim down easily and finish before technique degrades.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nCooldown",
        duration: {
          type: "distance",
          meters: 250,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  "77e49d0a-2b98-41be-9f4c-bc4fe2757003": {
    version: 5,
    activity_category: "swim",
    items: [
      {
        type: "step",
        id: "f08316a9-3ccf-42f5-881b-c936a3101582",
        name: "Warmup",
        instructions:
          "Notes:\nSwim easy freestyle; use catch-up drill for the first 50 m, then settle into a long, relaxed stroke.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nWarmup",
        duration: {
          type: "distance",
          meters: 350,
        },
        targets: [
          {
            type: "RPE",
            intensity: 3,
          },
        ],
      },
      {
        type: "repeat",
        id: "4ee128bb-9a2d-4407-b649-037029964fbc",
        count: 4,
        steps: [
          {
            type: "step",
            id: "43b069d6-8ffc-4522-9b48-8013a639cc5f",
            name: "Work",
            instructions:
              "Notes:\nAerobic freestyle repeats that rehearse lifting the eyes forward every six to eight strokes without breaking body line. Hold the prescribed effort only while stroke length and breathing remain controlled.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nSighting Endurance Swim",
            duration: {
              type: "distance",
              meters: 300,
            },
            targets: [
              {
                type: "RPE",
                intensity: 5,
              },
            ],
          },
          {
            type: "step",
            id: "fc8f22b5-b043-4669-9427-ad1a87f461ce",
            name: "Recovery",
            instructions:
              "Notes:\nRest at the wall; start the next repeat with calm breathing and deliberate form.",
            duration: {
              type: "time",
              seconds: 20,
            },
            targets: [
              {
                type: "rest",
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "ce61a83b-1aad-4487-b6c9-83f0a916cf3c",
        name: "Cooldown",
        instructions:
          "Notes:\nSwim down easily and finish before technique degrades.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nCooldown",
        duration: {
          type: "distance",
          meters: 250,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  "60f38619-ac3f-4265-b88b-f966d34045b2": {
    version: 5,
    activity_category: "strength",
    items: [
      {
        type: "step",
        id: "d13eab18-1d8a-4764-b9a6-0a9de477be51",
        name: "Warmup",
        instructions:
          "Notes:\nUse joint circles, bodyweight rehearsal, and one lighter practice set before loading.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 420,
        },
        targets: [
          {
            type: "RPE",
            intensity: 3,
          },
        ],
      },
      {
        type: "repeat",
        id: "b724dd4a-6bd8-41fe-9f8c-7c0fa23530c3",
        count: 3,
        steps: [
          {
            type: "step",
            id: "ac3fd265-60f3-4619-84d7-9d0a77e451be",
            name: "Goblet Squat",
            instructions:
              "Notes:\nUse a load that permits a controlled descent and stable foot pressure.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nGoblet Squat",
            duration: {
              type: "repetitions",
              count: 10,
            },
            targets: [
              {
                type: "RPE",
                intensity: 5,
              },
            ],
          },
          {
            type: "step",
            id: "5dca37a4-117e-4b58-8532-8e2168fbda6d",
            name: "Rest",
            instructions: "Notes:\nRecover fully enough to repeat precise movement.",
            duration: {
              type: "time",
              seconds: 45,
            },
            targets: [
              {
                type: "rest",
              },
            ],
          },
        ],
      },
      {
        type: "repeat",
        id: "9023b649-dc6f-4295-a8bb-e956c33035a2",
        count: 3,
        steps: [
          {
            type: "step",
            id: "37a45dca-eb58-417e-9f0c-fc8f22b5b043",
            name: "Romanian Deadlift",
            instructions:
              "Notes:\nKeep ribs stacked and stop a set if range or balance changes.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nRomanian Deadlift",
            duration: {
              type: "repetitions",
              count: 10,
            },
            targets: [
              {
                type: "RPE",
                intensity: 5,
              },
            ],
          },
          {
            type: "step",
            id: "66f940d3-b245-4c1f-be91-6bd891feb724",
            name: "Rest",
            instructions: "Notes:\nRecover fully enough to repeat precise movement.",
            duration: {
              type: "time",
              seconds: 45,
            },
            targets: [
              {
                type: "rest",
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "4add24b7-fe91-486b-b245-17843daacb38",
        name: "Cooldown",
        instructions:
          "Notes:\nWalk briefly, then use comfortable range-of-motion work for the trained areas.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 300,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  "79e653c0-c532-4f0c-917e-e275bc4f9629": {
    version: 5,
    activity_category: "strength",
    items: [
      {
        type: "step",
        id: "44d76afd-f88b-4eb1-ac3f-a5127fec59c6",
        name: "Warmup",
        instructions:
          "Notes:\nUse joint circles, bodyweight rehearsal, and one lighter practice set before loading.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 420,
        },
        targets: [
          {
            type: "RPE",
            intensity: 3,
          },
        ],
      },
      {
        type: "repeat",
        id: "fe91d86b-4add-44b7-a6f9-73e09906bf2c",
        count: 3,
        steps: [
          {
            type: "step",
            id: "85f25fcc-39a6-4380-9d8a-66f940d3b245",
            name: "Front Squat",
            instructions:
              "Notes:\nChoose a load that leaves about two clean reps in reserve; do not grind the final rep.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nFront Squat",
            duration: {
              type: "repetitions",
              count: 5,
            },
            targets: [
              {
                type: "RPE",
                intensity: 8,
              },
            ],
          },
          {
            type: "step",
            id: "9023b649-dc6f-4295-a8bb-e956c33035a2",
            name: "Rest",
            instructions: "Notes:\nRecover fully enough to repeat precise movement.",
            duration: {
              type: "time",
              seconds: 180,
            },
            targets: [
              {
                type: "rest",
              },
            ],
          },
        ],
      },
      {
        type: "repeat",
        id: "49b62390-9502-4fdc-a14e-f285cc5fa639",
        count: 3,
        steps: [
          {
            type: "step",
            id: "7e1158eb-ca5d-4437-a679-f36019863fac",
            name: "Trap-Bar Deadlift",
            instructions:
              "Notes:\nLeave about two clean reps in reserve; reset your brace between repetitions.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nTrap-Bar Deadlift",
            duration: {
              type: "repetitions",
              count: 5,
            },
            targets: [
              {
                type: "RPE",
                intensity: 8,
              },
            ],
          },
          {
            type: "step",
            id: "239049b6-6fdc-4502-bb28-e07306992cbf",
            name: "Rest",
            instructions: "Notes:\nRecover fully enough to repeat precise movement.",
            duration: {
              type: "time",
              seconds: 180,
            },
            targets: [
              {
                type: "rest",
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "c734ed5a-7be8-410e-af9c-4cdf72050093",
        name: "Cooldown",
        instructions:
          "Notes:\nWalk briefly, then use comfortable range-of-motion work for the trained areas.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 300,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  "ed5ac734-a10e-4be8-95c2-de71b84b2abd": {
    version: 5,
    activity_category: "strength",
    items: [
      {
        type: "step",
        id: "0295dc6f-b649-4023-9a2d-bf2ce55273e0",
        name: "Warmup",
        instructions:
          "Notes:\nUse joint circles, bodyweight rehearsal, and one lighter practice set before loading.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 420,
        },
        targets: [
          {
            type: "RPE",
            intensity: 3,
          },
        ],
      },
      {
        type: "repeat",
        id: "2cbf52e5-e073-4699-8457-1d8af764d13e",
        count: 3,
        steps: [
          {
            type: "step",
            id: "a10e7be8-ed5a-4734-8976-9a2d74074ee1",
            name: "Rear-Foot Elevated Split Squat",
            instructions:
              "Notes:\nUse support if needed; keep the working knee tracking over the middle toes.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nRear-Foot Elevated Split Squat",
            duration: {
              type: "repetitions",
              count: 8,
            },
            targets: [
              {
                type: "RPE",
                intensity: 6,
              },
            ],
          },
          {
            type: "step",
            id: "0699e073-52e5-4cbf-9e31-0b78319e57c4",
            name: "Rest",
            instructions: "Notes:\nRecover fully enough to repeat precise movement.",
            duration: {
              type: "time",
              seconds: 75,
            },
            targets: [
              {
                type: "rest",
              },
            ],
          },
        ],
      },
      {
        type: "repeat",
        id: "bd2a9704-71de-4bb8-a592-ee81c85b3acd",
        count: 3,
        steps: [
          {
            type: "step",
            id: "ac3fd265-60f3-4619-84d7-9d0a77e451be",
            name: "Single-Leg Romanian Deadlift",
            instructions:
              "Notes:\nMove slowly enough to keep the pelvis level on every repetition.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nSingle-Leg Romanian Deadlift",
            duration: {
              type: "repetitions",
              count: 8,
            },
            targets: [
              {
                type: "RPE",
                intensity: 6,
              },
            ],
          },
          {
            type: "step",
            id: "f7641d8a-ab18-413e-9fcc-3ccf62f5f083",
            name: "Rest",
            instructions: "Notes:\nRecover fully enough to repeat precise movement.",
            duration: {
              type: "time",
              seconds: 75,
            },
            targets: [
              {
                type: "rest",
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "43b069d6-8ffc-4522-9b48-8013a639cc5f",
        name: "Cooldown",
        instructions:
          "Notes:\nWalk briefly, then use comfortable range-of-motion work for the trained areas.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 300,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  "47b46dda-fb68-418e-af1c-cc5ff2858013": {
    version: 5,
    activity_category: "strength",
    items: [
      {
        type: "step",
        id: "a437ca5d-58eb-4e11-8c9f-0572df4cb926",
        name: "Warmup",
        instructions:
          "Notes:\nUse joint circles, bodyweight rehearsal, and one lighter practice set before loading.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 420,
        },
        targets: [
          {
            type: "RPE",
            intensity: 3,
          },
        ],
      },
      {
        type: "repeat",
        id: "ea7dc457-9e31-480b-92e5-37a45dcaeb58",
        count: 3,
        steps: [
          {
            type: "step",
            id: "eb58117e-37a4-4dca-93c0-b84bde710497",
            name: "Kettlebell Swing",
            instructions:
              "Notes:\nUse a light, familiar load and end the set before speed declines.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nKettlebell Swing",
            duration: {
              type: "repetitions",
              count: 6,
            },
            targets: [
              {
                type: "RPE",
                intensity: 6,
              },
            ],
          },
          {
            type: "step",
            id: "28bb4ee1-7407-4a2d-9023-d13eab181d8a",
            name: "Rest",
            instructions: "Notes:\nRecover fully enough to repeat precise movement.",
            duration: {
              type: "time",
              seconds: 180,
            },
            targets: [
              {
                type: "rest",
              },
            ],
          },
        ],
      },
      {
        type: "repeat",
        id: "17843daa-cb38-415e-bfec-5cef821510a3",
        count: 3,
        steps: [
          {
            type: "step",
            id: "6afd44d7-1eb1-488b-9265-b724dd4a6bd8",
            name: "Low Box Step-Up Drive",
            instructions:
              "Notes:\nStep down under control; replace the drive with a low step-up if landing is noisy.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nLow Box Step-Up Drive",
            duration: {
              type: "repetitions",
              count: 6,
            },
            targets: [
              {
                type: "RPE",
                intensity: 6,
              },
            ],
          },
          {
            type: "step",
            id: "85f25fcc-39a6-4380-9d8a-66f940d3b245",
            name: "Rest",
            instructions: "Notes:\nRecover fully enough to repeat precise movement.",
            duration: {
              type: "time",
              seconds: 180,
            },
            targets: [
              {
                type: "rest",
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "51be2b98-9d0a-47e4-b926-8a1d64f73ed1",
        name: "Cooldown",
        instructions:
          "Notes:\nWalk briefly, then use comfortable range-of-motion work for the trained areas.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 300,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  "c457ea7d-780b-4e31-acbf-2592ff6cd946": {
    version: 5,
    activity_category: "strength",
    items: [
      {
        type: "step",
        id: "a10e7be8-ed5a-4734-8976-9a2d74074ee1",
        name: "Warmup",
        instructions:
          "Notes:\nUse joint circles, bodyweight rehearsal, and one lighter practice set before loading.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 420,
        },
        targets: [
          {
            type: "RPE",
            intensity: 3,
          },
        ],
      },
      {
        type: "repeat",
        id: "9f0cc532-53c0-49e6-b7a4-74079a2d28bb",
        count: 3,
        steps: [
          {
            type: "step",
            id: "58eb7e11-a437-4a5d-8053-c12e9b080d7a",
            name: "Farmer Carry",
            instructions:
              "Notes:\nWalk tall with quiet steps; reduce load before grip or posture fails.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nFarmer Carry",
            duration: {
              type: "time",
              seconds: 30,
            },
            targets: [
              {
                type: "RPE",
                intensity: 6,
              },
            ],
          },
          {
            type: "step",
            id: "2592ff6c-d946-4320-bd2a-0699e07352e5",
            name: "Rest",
            instructions: "Notes:\nRecover fully enough to repeat precise movement.",
            duration: {
              type: "time",
              seconds: 60,
            },
            targets: [
              {
                type: "rest",
              },
            ],
          },
        ],
      },
      {
        type: "repeat",
        id: "54e77a0d-089b-4ec1-bc4f-75e24fbc2996",
        count: 3,
        steps: [
          {
            type: "step",
            id: "1f8c45b2-d340-4966-b724-f4871aada83b",
            name: "Half-Kneeling Pallof Press",
            instructions:
              "Notes:\nKeep hips and ribs square rather than twisting toward the band.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nHalf-Kneeling Pallof Press",
            duration: {
              type: "repetitions",
              count: 10,
            },
            targets: [
              {
                type: "RPE",
                intensity: 6,
              },
            ],
          },
          {
            type: "step",
            id: "5aed34c7-0ea1-487b-8255-e7540d7a9b08",
            name: "Rest",
            instructions: "Notes:\nRecover fully enough to repeat precise movement.",
            duration: {
              type: "time",
              seconds: 60,
            },
            targets: [
              {
                type: "rest",
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "96297003-e275-4c4f-aec1-5bc881eea714",
        name: "Cooldown",
        instructions:
          "Notes:\nWalk briefly, then use comfortable range-of-motion work for the trained areas.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 300,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  "8ffcb522-43b0-49d6-a794-24b74addd86b": {
    version: 5,
    activity_category: "other",
    items: [
      {
        type: "step",
        id: "b84bde71-0497-4abd-a0b3-a10e7be8ed5a",
        name: "Warmup",
        instructions:
          "Notes:\nBegin easily and check that movement feels comfortable today.\n\nBlock context:\nSegment: other activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 360,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
      {
        type: "step",
        id: "c330e956-0f7c-45a2-9bc8-009326b94cdf",
        name: "Mobility Flow",
        instructions:
          "Notes:\nMove through hips, thoracic spine, ankles, and shoulders without forcing range.\n\nBlock context:\nSegment: other activity\n\nInterval:\nMain Set",
        duration: {
          type: "time",
          seconds: 1080,
        },
        targets: [
          {
            type: "RPE",
            intensity: 3,
          },
        ],
      },
      {
        type: "step",
        id: "26b90093-7205-4cdf-be51-ab18d13ef764",
        name: "Cooldown",
        instructions:
          "Notes:\nEase gradually and finish with calm breathing.\n\nBlock context:\nSegment: other activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 300,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  "95026fdc-49b6-4390-ad9a-b64990230295": {
    version: 5,
    activity_category: "other",
    items: [
      {
        type: "step",
        id: "42d51caf-f689-4063-9a6d-7feca51233a0",
        name: "Warmup",
        instructions:
          "Notes:\nBegin easily and check that movement feels comfortable today.\n\nBlock context:\nSegment: other activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 360,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
      {
        type: "step",
        id: "89f663d0-d542-4f1c-a18e-b2458c1f66f9",
        name: "Balance Flow",
        instructions:
          "Notes:\nUse a wall or block as needed and keep the breath smooth in each position.\n\nBlock context:\nSegment: other activity\n\nInterval:\nMain Set",
        duration: {
          type: "time",
          seconds: 1800,
        },
        targets: [
          {
            type: "RPE",
            intensity: 4,
          },
        ],
      },
      {
        type: "step",
        id: "3ccf62f5-f083-46a9-9467-6dda47b4218e",
        name: "Cooldown",
        instructions:
          "Notes:\nEase gradually and finish with calm breathing.\n\nBlock context:\nSegment: other activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 300,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  "db48016e-2794-4dba-83b0-e87b0ea134c7": {
    version: 5,
    activity_category: "other",
    items: [
      {
        type: "step",
        id: "be51982b-0a9d-4477-a6b9-b320d946ff6c",
        name: "Warmup",
        instructions:
          "Notes:\nBegin easily and check that movement feels comfortable today.\n\nBlock context:\nSegment: other activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 360,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
      {
        type: "step",
        id: "e7540d7a-9b08-412e-8fbc-6cff922520b3",
        name: "Technique Row",
        instructions:
          "Notes:\nSequence legs, body, then arms; reduce pace if stroke length or rhythm breaks down.\n\nBlock context:\nSegment: other activity\n\nInterval:\nMain Set",
        duration: {
          type: "time",
          seconds: 1440,
        },
        targets: [
          {
            type: "RPE",
            intensity: 6,
          },
        ],
      },
      {
        type: "step",
        id: "a437ca5d-58eb-4e11-8c9f-0572df4cb926",
        name: "Cooldown",
        instructions:
          "Notes:\nEase gradually and finish with calm breathing.\n\nBlock context:\nSegment: other activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 300,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  "9f0cc532-53c0-49e6-b7a4-74079a2d28bb": {
    version: 5,
    activity_category: "other",
    items: [
      {
        type: "step",
        id: "48db6e01-9427-4a4d-b043-f15ecb383daa",
        name: "Warmup",
        instructions:
          "Notes:\nBegin easily and check that movement feels comfortable today.\n\nBlock context:\nSegment: other activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 360,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
      {
        type: "step",
        id: "d340f966-1f8c-45b2-abd8-50e376099c2f",
        name: "Steady Elliptical",
        instructions:
          "Notes:\nMaintain relaxed shoulders and even pressure; the effort should remain conversational.\n\nBlock context:\nSegment: other activity\n\nInterval:\nMain Set",
        duration: {
          type: "time",
          seconds: 2700,
        },
        targets: [
          {
            type: "RPE",
            intensity: 5,
          },
        ],
      },
      {
        type: "step",
        id: "1aadf487-ce61-483b-8215-27944dbadb48",
        name: "Cooldown",
        instructions:
          "Notes:\nEase gradually and finish with calm breathing.\n\nBlock context:\nSegment: other activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 300,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  "73e09906-bf2c-4552-8b78-70039629bc4f": {
    version: 5,
    activity_category: "run",
    items: [
      {
        type: "step",
        id: "a6398013-f285-4c5f-bed1-2b9851be77e4",
        name: "Warmup",
        instructions: "Block context:\nSegment: run activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 720,
        },
        targets: [
          {
            type: "%MaxHR",
            intensity: 70,
          },
        ],
      },
      {
        type: "repeat",
        id: "1caf42d5-d063-4689-b447-4dba2794016e",
        count: 4,
        steps: [
          {
            type: "step",
            id: "c734ed5a-7be8-410e-af9c-4cdf72050093",
            name: "Work",
            instructions:
              "Notes:\nBuild into 90–95% HRmax without sprinting the first minute.\n\nBlock context:\nSegment: run activity\n\nInterval:\n4×4 Aerobic Power",
            duration: {
              type: "time",
              seconds: 240,
            },
            targets: [
              {
                type: "%MaxHR",
                intensity: 92,
              },
            ],
          },
          {
            type: "step",
            id: "da6db447-8e21-48fb-82d5-67d48dfa1b88",
            name: "Active Recovery",
            instructions:
              "Notes:\nJog easily at about 70% HRmax; recover actively rather than standing still.",
            duration: {
              type: "time",
              seconds: 180,
            },
            targets: [
              {
                type: "%MaxHR",
                intensity: 70,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "9c2fc255-50e3-4609-b4c7-cd3aa71481ee",
        name: "Cooldown",
        instructions: "Block context:\nSegment: run activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "%MaxHR",
            intensity: 65,
          },
        ],
      },
    ],
  },
  "c5329f0c-79e6-43c0-9dca-26b900937205": {
    version: 5,
    activity_category: "run",
    items: [
      {
        type: "step",
        id: "ae41881b-fa8d-4467-96a9-e35009762f9c",
        name: "Warmup",
        instructions: "Block context:\nSegment: run activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 900,
        },
        targets: [
          {
            type: "RPE",
            intensity: 3,
          },
        ],
      },
      {
        type: "repeat",
        id: "58eb7e11-a437-4a5d-8053-c12e9b080d7a",
        count: 4,
        steps: [
          {
            type: "step",
            id: "c12e9b08-0d7a-4754-a996-3acd14a7ee81",
            name: "Controlled Work",
            instructions:
              "Notes:\nHold a repeatable sub-threshold effort at RPE 6–7; slow down if the individual calibration is no longer controlled.\n\nBlock context:\nSegment: run activity\n\nInterval:\nControlled Threshold Repeats",
            duration: {
              type: "distance",
              meters: 2000,
            },
            targets: [
              {
                type: "RPE",
                intensity: 7,
              },
            ],
          },
          {
            type: "step",
            id: "ea7dc457-9e31-480b-92e5-37a45dcaeb58",
            name: "Float Recovery",
            instructions:
              "Notes:\nUse an easy jog float; do not turn the recovery into a full stop.",
            duration: {
              type: "time",
              seconds: 60,
            },
            targets: [
              {
                type: "RPE",
                intensity: 2,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "d86bfe91-24b7-4add-80d3-41ae1b888dfa",
        name: "Cooldown",
        instructions: "Block context:\nSegment: run activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  "2cbf52e5-e073-4699-8457-1d8af764d13e": {
    version: 5,
    activity_category: "run",
    items: [
      {
        type: "step",
        id: "fb68218e-47b4-4dda-a3d0-881bae41d467",
        name: "Warmup",
        instructions: "Block context:\nSegment: run activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 900,
        },
        targets: [
          {
            type: "RPE",
            intensity: 3,
          },
        ],
      },
      {
        type: "repeat",
        id: "a10e7be8-ed5a-4734-8976-9a2d74074ee1",
        count: 25,
        steps: [
          {
            type: "step",
            id: "48db6e01-9427-4a4d-b043-f15ecb383daa",
            name: "Controlled Work",
            instructions:
              "Notes:\nHold a repeatable sub-threshold RPE 6–7; this distinct short-repeat protocol is not a long-repeat dose state.\n\nBlock context:\nSegment: run activity\n\nInterval:\n25×400 Controlled Threshold",
            duration: {
              type: "distance",
              meters: 400,
            },
            targets: [
              {
                type: "RPE",
                intensity: 7,
              },
            ],
          },
          {
            type: "step",
            id: "f7641d8a-ab18-413e-9fcc-3ccf62f5f083",
            name: "Float Recovery",
            instructions: "Notes:\nUse an easy jog float between controlled repeats.",
            duration: {
              type: "time",
              seconds: 30,
            },
            targets: [
              {
                type: "RPE",
                intensity: 2,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "218efb68-6dda-47b4-89f6-1aadf487ce61",
        name: "Cooldown",
        instructions: "Block context:\nSegment: run activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  "4dba2794-016e-4b48-b522-3ed118ab8a1d": {
    version: 5,
    activity_category: "swim",
    items: [
      {
        type: "step",
        id: "48db6e01-9427-4a4d-b043-f15ecb383daa",
        name: "Warmup",
        instructions: "Block context:\nSegment: swim activity\n\nInterval:\nWarmup",
        duration: {
          type: "distance",
          meters: 400,
        },
        targets: [
          {
            type: "RPE",
            intensity: 3,
          },
        ],
      },
      {
        type: "repeat",
        id: "ea7dc457-9e31-480b-92e5-37a45dcaeb58",
        count: 8,
        steps: [
          {
            type: "step",
            id: "61ce3ba8-ad1a-47f4-8936-da6db4478e21",
            name: "CSS Work",
            instructions:
              "Notes:\nSwim at individually estimated CSS pace at RPE 7 with a long, repeatable stroke.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nCSS Repeats",
            duration: {
              type: "distance",
              meters: 100,
            },
            targets: [
              {
                type: "RPE",
                intensity: 7,
              },
            ],
          },
          {
            type: "step",
            id: "bc4fe275-7003-4629-94e7-ed5ac734a10e",
            name: "Short Rest",
            instructions:
              "Notes:\nTake a short wall rest, then leave on the planned interval without rushing technique.",
            duration: {
              type: "time",
              seconds: 15,
            },
            targets: [
              {
                type: "rest",
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "6afd44d7-1eb1-488b-9265-b724dd4a6bd8",
        name: "Cooldown",
        instructions: "Block context:\nSegment: swim activity\n\nInterval:\nCooldown",
        duration: {
          type: "distance",
          meters: 200,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  "dd4ab724-91fe-4bd8-85b2-0ea1e87b5aed": {
    version: 5,
    activity_category: "strength",
    items: [
      {
        type: "step",
        id: "96297003-e275-4c4f-aec1-5bc881eea714",
        name: "Movement Prep",
        instructions:
          "Notes:\nDynamic movements to prepare entire body\n\nBlock context:\nSegment: strength activity\n\nInterval:\nMovement Prep",
        duration: {
          type: "time",
          seconds: 300,
        },
        targets: [
          {
            type: "RPE",
            intensity: 4,
          },
        ],
      },
      {
        type: "repeat",
        id: "74079a2d-28bb-4ee1-9c6f-95026fdc49b6",
        count: 5,
        steps: [
          {
            type: "step",
            id: "61ce3ba8-ad1a-47f4-8936-da6db4478e21",
            name: "Circuit Round",
            instructions:
              "Notes:\nBurpees, mountain climbers, squat jumps, push-ups - 45s work, 15s rest\n\nBlock context:\nSegment: strength activity\n\nInterval:\nInterval 2",
            duration: {
              type: "time",
              seconds: 360,
            },
            targets: [
              {
                type: "RPE",
                intensity: 8,
              },
            ],
          },
          {
            type: "step",
            id: "aa3d8417-5ef1-48cb-92a5-77e49d0a2b98",
            name: "Active Recovery",
            instructions: "Notes:\nLight movement, breathing exercises",
            duration: {
              type: "time",
              seconds: 120,
            },
            targets: [
              {
                type: "RPE",
                intensity: 3,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "f4871aad-a83b-4e61-9cef-1582ef5cc936",
        name: "Recovery Stretch",
        instructions:
          "Notes:\nStatic stretches for all major muscle groups\n\nBlock context:\nSegment: strength activity\n\nInterval:\nRecovery Stretch",
        duration: {
          type: "time",
          seconds: 300,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  "ae41881b-fa8d-4467-96a9-e35009762f9c": {
    version: 5,
    activity_category: "strength",
    items: [
      {
        type: "step",
        id: "9300b926-df4c-4572-ab98-9023b649dc6f",
        name: "Core Activation",
        instructions:
          "Notes:\nBreathing exercises, gentle core engagement\n\nBlock context:\nSegment: strength activity\n\nInterval:\nCore Activation",
        duration: {
          type: "time",
          seconds: 300,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
      {
        type: "repeat",
        id: "1582ef5c-c936-4310-ad1a-36c910a38215",
        count: 3,
        steps: [
          {
            type: "step",
            id: "82155cef-36c9-40a3-9aad-3fac65d2f360",
            name: "Plank Variations",
            instructions:
              "Notes:\nFront plank, side planks, plank variations - 30-60s holds\n\nBlock context:\nSegment: strength activity\n\nInterval:\nInterval 2",
            duration: {
              type: "time",
              seconds: 240,
            },
            targets: [
              {
                type: "RPE",
                intensity: 5,
              },
            ],
          },
          {
            type: "step",
            id: "e7540d7a-9b08-412e-8fbc-6cff922520b3",
            name: "Dynamic Core",
            instructions: "Notes:\nDead bugs, bird dogs, bicycle crunches, leg raises",
            duration: {
              type: "time",
              seconds: 240,
            },
            targets: [
              {
                type: "RPE",
                intensity: 6,
              },
            ],
          },
          {
            type: "step",
            id: "54e77a0d-089b-4ec1-bc4f-75e24fbc2996",
            name: "Recovery",
            instructions: "Notes:\nLight movement and breathing",
            duration: {
              type: "time",
              seconds: 60,
            },
            targets: [
              {
                type: "RPE",
                intensity: 2,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "95026fdc-49b6-4390-ad9a-b64990230295",
        name: "Hip and Spine Mobility",
        instructions:
          "Notes:\nCat-cow, hip circles, spinal twists\n\nBlock context:\nSegment: strength activity\n\nInterval:\nHip and Spine Mobility",
        duration: {
          type: "time",
          seconds: 300,
        },
        targets: [
          {
            type: "RPE",
            intensity: 1,
          },
        ],
      },
    ],
  },
  "117eeb58-5dca-47a4-b9e6-ca5da4377e11": {
    version: 5,
    activity_category: "other",
    items: [
      {
        type: "step",
        id: "f689d063-42d5-4caf-8e21-3ba861ce87f4",
        name: "Centering & Breath",
        instructions:
          "Notes:\nFocus on breathing, gentle movements to center yourself\n\nBlock context:\nSegment: other activity\n\nInterval:\nCentering & Breath",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "%MaxHR",
            intensity: 50,
          },
        ],
      },
      {
        type: "step",
        id: "9d0a77e4-51be-4b98-8572-4ee128bb9a2d",
        name: "Sun Salutations",
        instructions:
          "Notes:\n5-8 rounds of sun salutation A and B, link breath with movement\n\nBlock context:\nSegment: other activity\n\nInterval:\nSun Salutations",
        duration: {
          type: "time",
          seconds: 1200,
        },
        targets: [
          {
            type: "%MaxHR",
            intensity: 60,
          },
        ],
      },
      {
        type: "step",
        id: "2cbf52e5-e073-4699-8457-1d8af764d13e",
        name: "Standing Poses",
        instructions:
          "Notes:\nWarrior poses, triangle, tree pose - hold for 5-8 breaths each\n\nBlock context:\nSegment: other activity\n\nInterval:\nStanding Poses",
        duration: {
          type: "time",
          seconds: 900,
        },
        targets: [
          {
            type: "%MaxHR",
            intensity: 55,
          },
        ],
      },
      {
        type: "step",
        id: "83f0a916-cf3c-4562-9b88-40d366f98c1f",
        name: "Floor Sequence",
        instructions:
          "Notes:\nHip openers, twists, gentle backbends\n\nBlock context:\nSegment: other activity\n\nInterval:\nFloor Sequence",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "%MaxHR",
            intensity: 45,
          },
        ],
      },
      {
        type: "step",
        id: "92256cff-46d9-40b3-aabd-0f7c35a2c330",
        name: "Relaxation",
        instructions:
          "Notes:\nComplete stillness, body scan, deep relaxation\n\nBlock context:\nSegment: other activity\n\nInterval:\nRelaxation",
        duration: {
          type: "time",
          seconds: 300,
        },
        targets: [
          {
            type: "%MaxHR",
            intensity: 40,
          },
        ],
      },
    ],
  },
  "319e0b78-7dea-47c4-9906-ea7dc4579e31": {
    version: 5,
    activity_category: "strength",
    items: [
      {
        type: "step",
        id: "8a1d64f7-3ed1-48ab-b285-d744fd6a8bf8",
        name: "Warmup",
        instructions:
          "Notes:\nDynamic stretching and mobility\n\nBlock context:\nSegment: strength activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 300,
        },
        targets: [
          {
            type: "RPE",
            intensity: 3,
          },
        ],
      },
      {
        type: "repeat",
        id: "24b74add-d86b-4e91-8c1f-85f25fcc39a6",
        count: 3,
        steps: [
          {
            type: "step",
            id: "9d0a77e4-51be-4b98-8572-4ee128bb9a2d",
            name: "Bench Press",
            instructions:
              "Notes:\nChoose a load that leaves about two clean reps in reserve; use safeties or a spotter.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nBench Press",
            duration: {
              type: "repetitions",
              count: 8,
            },
            targets: [
              {
                type: "RPE",
                intensity: 8,
              },
            ],
          },
          {
            type: "step",
            id: "0699e073-52e5-4cbf-9e31-0b78319e57c4",
            name: "Rest",
            duration: {
              type: "time",
              seconds: 120,
            },
            targets: [
              {
                type: "rest",
              },
            ],
          },
        ],
      },
      {
        type: "repeat",
        id: "c12e9b08-0d7a-4754-a996-3acd14a7ee81",
        count: 3,
        steps: [
          {
            type: "step",
            id: "a437ca5d-58eb-4e11-8c9f-0572df4cb926",
            name: "Bent Over Rows",
            instructions:
              "Notes:\nLeave about three clean reps in reserve; keep the torso stable without jerking.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nRows",
            duration: {
              type: "repetitions",
              count: 10,
            },
            targets: [
              {
                type: "RPE",
                intensity: 7,
              },
            ],
          },
          {
            type: "step",
            id: "1b8841ae-67d4-4dfa-83f0-a83bce61f487",
            name: "Rest",
            duration: {
              type: "time",
              seconds: 120,
            },
            targets: [
              {
                type: "rest",
              },
            ],
          },
        ],
      },
      {
        type: "repeat",
        id: "9a2d7407-4ee1-48bb-8295-a714cd3a5bc8",
        count: 3,
        steps: [
          {
            type: "step",
            id: "3fac65d2-f360-4986-9744-9427ba4d48db",
            name: "Overhead Press",
            instructions:
              "Notes:\nLeave about two clean reps in reserve; stop before leaning back or grinding.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nOverhead Press",
            duration: {
              type: "repetitions",
              count: 8,
            },
            targets: [
              {
                type: "RPE",
                intensity: 8,
              },
            ],
          },
          {
            type: "step",
            id: "58eb7e11-a437-4a5d-8053-c12e9b080d7a",
            name: "Rest",
            duration: {
              type: "time",
              seconds: 120,
            },
            targets: [
              {
                type: "rest",
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "26b90093-7205-4cdf-be51-ab18d13ef764",
        name: "Cooldown",
        instructions:
          "Notes:\nStatic stretching\n\nBlock context:\nSegment: strength activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 300,
        },
        targets: [
          {
            type: "RPE",
            intensity: 1,
          },
        ],
      },
    ],
  },
  "7a0d54e7-2ec1-489b-a275-07742d9abb28": {
    version: 5,
    activity_category: "strength",
    items: [
      {
        type: "step",
        id: "2d9a0774-e14e-4b28-9502-9e31780bea7d",
        name: "Warmup",
        instructions:
          "Notes:\nDynamic leg swings and mobility\n\nBlock context:\nSegment: strength activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 300,
        },
        targets: [
          {
            type: "RPE",
            intensity: 3,
          },
        ],
      },
      {
        type: "repeat",
        id: "eb58117e-37a4-4dca-93c0-b84bde710497",
        count: 4,
        steps: [
          {
            type: "step",
            id: "5ef138cb-aa3d-4417-8659-d340f9661f8c",
            name: "Back Squats",
            instructions:
              "Notes:\nLeave about two clean reps in reserve; maintain depth and bracing with safeties set.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nSquats",
            duration: {
              type: "repetitions",
              count: 5,
            },
            targets: [
              {
                type: "RPE",
                intensity: 8,
              },
            ],
          },
          {
            type: "step",
            id: "117eeb58-5dca-47a4-b9e6-ca5da4377e11",
            name: "Rest",
            instructions: "Notes:\nFull recovery",
            duration: {
              type: "time",
              seconds: 180,
            },
            targets: [
              {
                type: "rest",
              },
            ],
          },
        ],
      },
      {
        type: "repeat",
        id: "ea7dc457-9e31-480b-92e5-37a45dcaeb58",
        count: 3,
        steps: [
          {
            type: "step",
            id: "6bd891fe-b724-4d4a-9340-38cb5ef18417",
            name: "Romanian Deadlifts",
            instructions:
              "Notes:\nLeave about two clean reps in reserve; stop before back position or range changes.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nDeadlifts",
            duration: {
              type: "repetitions",
              count: 8,
            },
            targets: [
              {
                type: "RPE",
                intensity: 8,
              },
            ],
          },
          {
            type: "step",
            id: "009326b9-4cdf-4205-982b-990673e0e552",
            name: "Rest",
            duration: {
              type: "time",
              seconds: 120,
            },
            targets: [
              {
                type: "rest",
              },
            ],
          },
        ],
      },
      {
        type: "repeat",
        id: "9d0a77e4-51be-4b98-8572-4ee128bb9a2d",
        count: 3,
        steps: [
          {
            type: "step",
            id: "5cef8215-10a3-46c9-b487-0d7ae754c12e",
            name: "Walking Lunges",
            instructions:
              "Notes:\nEach leg; leave about three clean reps in reserve and keep balance controlled.\n\nBlock context:\nSegment: strength activity\n\nInterval:\nLunges",
            duration: {
              type: "repetitions",
              count: 12,
            },
            targets: [
              {
                type: "RPE",
                intensity: 7,
              },
            ],
          },
          {
            type: "step",
            id: "87f4ad1a-3ba8-41ce-af5c-8c1fb24540d3",
            name: "Rest",
            duration: {
              type: "time",
              seconds: 120,
            },
            targets: [
              {
                type: "rest",
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "f15ecb38-3daa-4784-99c6-2abd0497de71",
        name: "Cooldown",
        instructions:
          "Notes:\nFoam rolling and stretching\n\nBlock context:\nSegment: strength activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 300,
        },
        targets: [
          {
            type: "RPE",
            intensity: 1,
          },
        ],
      },
    ],
  },
  "2b9851be-77e4-4d0a-9300-780b9e31c457": {
    version: 5,
    activity_category: "swim",
    items: [
      {
        type: "step",
        id: "c2559c2f-7609-40e3-9aed-ff6c2592b320",
        name: "Easy Warm-up",
        instructions:
          "Notes:\nMix of easy freestyle and backstroke, focus on feel for the water\n\nBlock context:\nSegment: swim activity\n\nInterval:\nEasy Warm-up",
        duration: {
          type: "distance",
          meters: 400,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 60,
          },
        ],
      },
      {
        type: "step",
        id: "e7540d7a-9b08-412e-8fbc-6cff922520b3",
        name: "Steady Swim",
        instructions:
          "Notes:\nMaintain steady rhythm, focus on stroke technique and breathing pattern\n\nBlock context:\nSegment: swim activity\n\nInterval:\nSteady Swim",
        duration: {
          type: "distance",
          meters: 1400,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 70,
          },
        ],
      },
      {
        type: "step",
        id: "5cef8215-10a3-46c9-b487-0d7ae754c12e",
        name: "Easy Cool-down",
        instructions:
          "Notes:\nMix of strokes, very relaxed pace\n\nBlock context:\nSegment: swim activity\n\nInterval:\nEasy Cool-down",
        duration: {
          type: "distance",
          meters: 200,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 60,
          },
        ],
      },
    ],
  },
  "42d51caf-f689-4063-9a6d-7feca51233a0": {
    version: 5,
    activity_category: "swim",
    items: [
      {
        type: "step",
        id: "e552bf2c-9906-43e0-bdea-46d920b39225",
        name: "Warm-up",
        instructions:
          "Notes:\nSwim 400 m easy freestyle, then use catch-up drill for 4×50 m before building the final 100 m freestyle.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nWarm-up",
        duration: {
          type: "distance",
          meters: 600,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 65,
          },
        ],
      },
      {
        type: "repeat",
        id: "3ba861ce-87f4-4d1a-a310-48db6e019427",
        count: 4,
        steps: [
          {
            type: "step",
            id: "16a9f083-62f5-4ccf-ae41-db48016e2794",
            name: "Threshold Interval",
            instructions:
              "Notes:\nSteady hard effort - should feel comfortably hard but sustainable\n\nBlock context:\nSegment: swim activity\n\nInterval:\nInterval 2",
            duration: {
              type: "distance",
              meters: 400,
            },
            targets: [
              {
                type: "%ThresholdHR",
                intensity: 85,
              },
            ],
          },
          {
            type: "step",
            id: "1986f360-65d2-4fac-b11e-82155cef36c9",
            name: "Recovery",
            instructions: "Notes:\nEasy backstroke or freestyle to recover",
            duration: {
              type: "distance",
              meters: 100,
            },
            targets: [
              {
                type: "%ThresholdHR",
                intensity: 65,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "bb28e14e-0774-4d9a-a390-c85bee8114a7",
        name: "Cool-down",
        instructions:
          "Notes:\nVery easy mixed strokes, include some floating/stretching\n\nBlock context:\nSegment: swim activity\n\nInterval:\nCool-down",
        duration: {
          type: "distance",
          meters: 400,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 55,
          },
        ],
      },
    ],
  },
  "8417aa3d-38cb-4ef1-ac7f-65d23fac1986": {
    version: 5,
    activity_category: "swim",
    items: [
      {
        type: "step",
        id: "1f8c45b2-d340-4966-b724-f4871aada83b",
        name: "Easy Warm-up",
        instructions:
          "Notes:\nEasy freestyle and backstroke, focus on feel\n\nBlock context:\nSegment: swim activity\n\nInterval:\nEasy Warm-up",
        duration: {
          type: "distance",
          meters: 300,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 60,
          },
        ],
      },
      {
        type: "repeat",
        id: "d13eab18-1d8a-4764-b9a6-0a9de477be51",
        count: 3,
        steps: [
          {
            type: "step",
            id: "a83bce61-f487-4aad-90a3-51be2b989d0a",
            name: "Freestyle Drills",
            instructions:
              "Notes:\nCatch-up, fingertip drag, single-arm swimming\n\nBlock context:\nSegment: swim activity\n\nInterval:\nInterval 2",
            duration: {
              type: "distance",
              meters: 200,
            },
            targets: [
              {
                type: "%ThresholdHR",
                intensity: 65,
              },
            ],
          },
          {
            type: "step",
            id: "138039a6-5fcc-45f2-ab18-10a336c95cef",
            name: "Build Swimming",
            instructions: "Notes:\nStart easy, build speed while maintaining technique",
            duration: {
              type: "distance",
              meters: 150,
            },
            targets: [
              {
                type: "%ThresholdHR",
                intensity: 75,
              },
            ],
          },
          {
            type: "step",
            id: "a2357c0f-56e9-40c3-bacd-df4c05729300",
            name: "Easy Recovery",
            instructions: "Notes:\nBackstroke or easy freestyle",
            duration: {
              type: "distance",
              meters: 100,
            },
            targets: [
              {
                type: "%ThresholdHR",
                intensity: 60,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "51be2b98-9d0a-47e4-b926-8a1d64f73ed1",
        name: "Mixed Strokes",
        instructions:
          "Notes:\nInclude backstroke, breaststroke, and freestyle\n\nBlock context:\nSegment: swim activity\n\nInterval:\nMixed Strokes",
        duration: {
          type: "distance",
          meters: 300,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 70,
          },
        ],
      },
      {
        type: "step",
        id: "7a0d54e7-2ec1-489b-a275-07742d9abb28",
        name: "Cool-down",
        instructions:
          "Notes:\nVery easy mixed swimming\n\nBlock context:\nSegment: swim activity\n\nInterval:\nCool-down",
        duration: {
          type: "distance",
          meters: 200,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 55,
          },
        ],
      },
    ],
  },
  "f285cc5f-a639-4013-8a1d-ef5c1582a310": {
    version: 5,
    activity_category: "swim",
    items: [
      {
        type: "step",
        id: "ed5ac734-a10e-4be8-95c2-de71b84b2abd",
        name: "Easy Warm-up",
        instructions:
          "Notes:\n400 m easy swimming to settle into the session.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nEasy Warm-up",
        duration: {
          type: "distance",
          meters: 400,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 60,
          },
        ],
      },
      {
        type: "repeat",
        id: "9b08c12e-e754-4d7a-8370-28bb4ee17407",
        count: 8,
        steps: [
          {
            type: "step",
            id: "fe91d86b-4add-44b7-a6f9-73e09906bf2c",
            name: "Drill/Swim",
            instructions:
              "Notes:\nAlternate drill and swim repetitions for 400 m total.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nInterval 2",
            duration: {
              type: "distance",
              meters: 50,
            },
            targets: [
              {
                type: "%ThresholdHR",
                intensity: 65,
              },
            ],
          },
        ],
      },
      {
        type: "repeat",
        id: "c2559c2f-7609-40e3-9aed-ff6c2592b320",
        count: 6,
        steps: [
          {
            type: "step",
            id: "1b8841ae-67d4-4dfa-83f0-a83bce61f487",
            name: "Zone 3",
            instructions:
              "Notes:\nControlled Zone 3 swimming.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nInterval 3",
            duration: {
              type: "distance",
              meters: 400,
            },
            targets: [
              {
                type: "%ThresholdHR",
                intensity: 75,
              },
            ],
          },
          {
            type: "step",
            id: "b84bde71-0497-4abd-a0b3-a10e7be8ed5a",
            name: "Rest",
            instructions: "Notes:\n30 seconds rest.",
            duration: {
              type: "time",
              seconds: 30,
            },
            targets: [
              {
                type: "%ThresholdHR",
                intensity: 55,
              },
            ],
          },
        ],
      },
      {
        type: "repeat",
        id: "bd2a9704-71de-4bb8-a592-ee81c85b3acd",
        count: 4,
        steps: [
          {
            type: "step",
            id: "ac3fd265-60f3-4619-84d7-9d0a77e451be",
            name: "Threshold",
            instructions:
              "Notes:\nThreshold effort.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nInterval 4",
            duration: {
              type: "distance",
              meters: 100,
            },
            targets: [
              {
                type: "%ThresholdHR",
                intensity: 85,
              },
            ],
          },
          {
            type: "step",
            id: "df4c0572-9300-4926-b7e4-34c75aede87b",
            name: "Easy",
            instructions: "Notes:\nEasy swimming recovery.",
            duration: {
              type: "distance",
              meters: 100,
            },
            targets: [
              {
                type: "%ThresholdHR",
                intensity: 60,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "b9269300-0572-4f4c-91be-a2357c0f56e9",
        name: "Easy Cool-down",
        instructions:
          "Notes:\n400 m easy swimming to finish.\n\nBlock context:\nSegment: swim activity\n\nInterval:\nEasy Cool-down",
        duration: {
          type: "distance",
          meters: 400,
        },
        targets: [
          {
            type: "%ThresholdHR",
            intensity: 55,
          },
        ],
      },
    ],
  },
  "7e1158eb-ca5d-4437-a679-f36019863fac": {
    version: 5,
    activity_category: "other",
    items: [
      {
        type: "step",
        id: "016edb48-4dba-4794-a9d6-fa8dd467ae41",
        name: "Warmup",
        instructions: "Block context:\nSegment: other activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 720,
        },
        targets: [
          {
            type: "RPE",
            intensity: 3,
          },
        ],
      },
      {
        type: "step",
        id: "12a5ec7f-c659-4033-aa3d-8ffcb52243b0",
        name: "Race Simulation",
        instructions:
          "Notes:\nSustain event-specific pacing and practice planned transitions or fueling.\n\nBlock context:\nSegment: other activity\n\nInterval:\nRace Simulation",
        duration: {
          type: "time",
          seconds: 2160,
        },
        targets: [
          {
            type: "RPE",
            intensity: 7,
          },
        ],
      },
      {
        type: "step",
        id: "8ffcb522-43b0-49d6-a794-24b74addd86b",
        name: "Finishing Effort",
        instructions:
          "Notes:\nFinish strongly while preserving movement quality.\n\nBlock context:\nSegment: other activity\n\nInterval:\nFinishing Effort",
        duration: {
          type: "time",
          seconds: 480,
        },
        targets: [
          {
            type: "RPE",
            intensity: 8,
          },
        ],
      },
      {
        type: "step",
        id: "c053e679-0c9f-42c5-98eb-d946b3202592",
        name: "Cooldown",
        instructions: "Block context:\nSegment: other activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 480,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  "39a61380-85f2-4fcc-913e-22b5fc8fd669": {
    version: 5,
    activity_category: "other",
    items: [
      {
        type: "step",
        id: "66f940d3-b245-4c1f-be91-6bd891feb724",
        name: "Easy Start",
        instructions:
          "Notes:\nVery comfortable walking pace, focus on posture and breathing\n\nBlock context:\nSegment: other activity\n\nInterval:\nEasy Start",
        duration: {
          type: "time",
          seconds: 900,
        },
        targets: [
          {
            type: "%MaxHR",
            intensity: 55,
          },
        ],
      },
      {
        type: "step",
        id: "b5228ffc-69d6-43b0-8dba-56e930c3a235",
        name: "Steady Walk",
        instructions:
          "Notes:\nSlightly brisker pace but still conversational\n\nBlock context:\nSegment: other activity\n\nInterval:\nSteady Walk",
        duration: {
          type: "time",
          seconds: 1200,
        },
        targets: [
          {
            type: "%MaxHR",
            intensity: 60,
          },
        ],
      },
      {
        type: "step",
        id: "cc5ff285-8013-4639-a4f7-bd2a970471de",
        name: "Easy Finish",
        instructions:
          "Notes:\nReturn to gentle pace, enjoy the surroundings\n\nBlock context:\nSegment: other activity\n\nInterval:\nEasy Finish",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "%MaxHR",
            intensity: 55,
          },
        ],
      },
    ],
  },
  "9023b649-dc6f-4295-a8bb-e956c33035a2": {
    version: 5,
    activity_category: "other",
    items: [
      {
        type: "step",
        id: "65d23fac-1986-4360-bd6a-c659a03312a5",
        name: "Warmup",
        instructions: "Block context:\nSegment: other activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 720,
        },
        targets: [
          {
            type: "RPE",
            intensity: 3,
          },
        ],
      },
      {
        type: "repeat",
        id: "07742d9a-bb28-414e-afdc-0c9f32c5c053",
        count: 4,
        steps: [
          {
            type: "step",
            id: "cc5ff285-8013-4639-a4f7-bd2a970471de",
            name: "Threshold Row",
            instructions: "Block context:\nSegment: other activity\n\nInterval:\nThreshold Repeats",
            duration: {
              type: "time",
              seconds: 480,
            },
            targets: [
              {
                type: "RPE",
                intensity: 8,
              },
            ],
          },
          {
            type: "step",
            id: "71de4bb8-bd2a-4704-9946-aa3d84175ef1",
            name: "Easy Row",
            duration: {
              type: "time",
              seconds: 180,
            },
            targets: [
              {
                type: "RPE",
                intensity: 2,
              },
            ],
          },
        ],
      },
      {
        type: "step",
        id: "87f4ad1a-3ba8-41ce-af5c-8c1fb24540d3",
        name: "Cooldown",
        instructions: "Block context:\nSegment: other activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  "c12e9b08-0d7a-4754-a996-3acd14a7ee81": {
    version: 5,
    activity_category: "other",
    items: [
      {
        type: "step",
        id: "b6499023-0295-4c6f-8ee1-7be8a10ec734",
        name: "Warmup",
        instructions: "Block context:\nSegment: other activity\n\nInterval:\nWarmup",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
      {
        type: "step",
        id: "5dca37a4-117e-4b58-8532-8e2168fbda6d",
        name: "Steady Endurance",
        instructions:
          "Notes:\nMaintain smooth, sustainable pressure and relaxed upper-body posture.\n\nBlock context:\nSegment: other activity\n\nInterval:\nSteady Endurance",
        duration: {
          type: "time",
          seconds: 6000,
        },
        targets: [
          {
            type: "RPE",
            intensity: 4,
          },
        ],
      },
      {
        type: "step",
        id: "a437ca5d-58eb-4e11-8c9f-0572df4cb926",
        name: "Cooldown",
        instructions: "Block context:\nSegment: other activity\n\nInterval:\nCooldown",
        duration: {
          type: "time",
          seconds: 600,
        },
        targets: [
          {
            type: "RPE",
            intensity: 2,
          },
        ],
      },
    ],
  },
  "73d53dd1-f8b8-4d7f-9ba7-dfa4de116211": {
    version: 5,
    activity_category: "swim",
    items: [
      {
        type: "step",
        id: "73d53dd1-f8b8-4d7f-9ba7-dfa4de116213",
        name: "Sprint Base Swim",
        instructions: "Block context:\nSegment: Sprint Base Swim\n\nInterval:\nSprint Base Swim",
        duration: {
          type: "time",
          seconds: 1200,
        },
        targets: [
          {
            type: "RPE",
            intensity: 5,
          },
        ],
      },
    ],
  },
  "73d53dd1-f8b8-4d7f-9ba7-dfa4de116221": {
    version: 5,
    activity_category: "bike",
    items: [
      {
        type: "step",
        id: "73d53dd1-f8b8-4d7f-9ba7-dfa4de116223",
        name: "Sprint Base Bike",
        instructions: "Block context:\nSegment: Sprint Base Bike\n\nInterval:\nSprint Base Bike",
        duration: {
          type: "time",
          seconds: 2700,
        },
        targets: [
          {
            type: "RPE",
            intensity: 6,
          },
        ],
      },
    ],
  },
  "73d53dd1-f8b8-4d7f-9ba7-dfa4de116231": {
    version: 5,
    activity_category: "run",
    items: [
      {
        type: "step",
        id: "73d53dd1-f8b8-4d7f-9ba7-dfa4de116233",
        name: "Sprint Base Run",
        instructions: "Block context:\nSegment: Sprint Base Run\n\nInterval:\nSprint Base Run",
        duration: {
          type: "time",
          seconds: 1500,
        },
        targets: [
          {
            type: "RPE",
            intensity: 6,
          },
        ],
      },
    ],
  },
  "73d53dd1-f8b8-4d7f-9ba7-dfa4de116241": {
    version: 5,
    activity_category: "run",
    items: [
      {
        type: "step",
        id: "73d53dd1-f8b8-4d7f-9ba7-dfa4de116243",
        name: "Duathlon Base Run",
        instructions: "Block context:\nSegment: Duathlon Base Run\n\nInterval:\nDuathlon Base Run",
        duration: {
          type: "time",
          seconds: 1200,
        },
        targets: [
          {
            type: "RPE",
            intensity: 5,
          },
        ],
      },
    ],
  },
  "73d53dd1-f8b8-4d7f-9ba7-dfa4de116251": {
    version: 5,
    activity_category: "bike",
    items: [
      {
        type: "step",
        id: "73d53dd1-f8b8-4d7f-9ba7-dfa4de116253",
        name: "Duathlon Base Bike",
        instructions:
          "Block context:\nSegment: Duathlon Base Bike\n\nInterval:\nDuathlon Base Bike",
        duration: {
          type: "time",
          seconds: 2400,
        },
        targets: [
          {
            type: "RPE",
            intensity: 6,
          },
        ],
      },
    ],
  },
  "73d53dd1-f8b8-4d7f-9ba7-dfa4de116261": {
    version: 5,
    activity_category: "run",
    items: [
      {
        type: "step",
        id: "73d53dd1-f8b8-4d7f-9ba7-dfa4de116263",
        name: "Duathlon Progression Run",
        instructions:
          "Block context:\nSegment: Duathlon Progression Run\n\nInterval:\nDuathlon Progression Run",
        duration: {
          type: "time",
          seconds: 1200,
        },
        targets: [
          {
            type: "RPE",
            intensity: 7,
          },
        ],
      },
    ],
  },
  ...Object.fromEntries(
    REFERENCE_ASSESSMENT_ACTIVITIES.map((template) => [template.id, template.structure]),
  ),
};

function requireFixedStructure(
  source: Record<string, unknown>,
  key: string,
): ActivityPlanStructure {
  const structure = source[key];
  if (!structure) throw new Error(`Missing fixed V5 activity-plan structure for ${key}.`);
  return withCatalogStepNotes(activityPlanStructureSchema.parse(structure));
}

export function fixedActivityPlanStructureForTemplate(templateId: string): ActivityPlanStructure {
  return requireFixedStructure(byTemplateId, templateId);
}

export function fixedActivityPlanStructureForSourceSegment(
  sourceSegmentId: string,
): ActivityPlanStructure {
  return requireFixedStructure(bySourceSegmentId, sourceSegmentId);
}

export function hasFixedActivityPlanStructureForSourceSegment(sourceSegmentId: string): boolean {
  return sourceSegmentId in bySourceSegmentId;
}

export const FIXED_SYSTEM_ACTIVITY_TEMPLATE_COUNT = Object.keys(byTemplateId).length;
