// Simple test script for the Edge Function
async function testEdgeFunction() {
  const testPayload = {
    activityId: "test-activity-12345",
    profileId: "test-user-67890",
    activityData: {
      id: "test-activity-12345",
      profileId: "test-user-67890",
      startedAt: "2025-01-05T10:00:00.000Z",
      endedAt: "2025-01-05T11:30:00.000Z",
      recordMessages: [
        {
          timestamp: "2025-01-05T10:00:00.000Z",
          positionLat: 40.7128,
          positionLong: -74.0060,
          altitude: 10.0,
          distance: 0,
          speed: 0,
          heartRate: 65
        },
        {
          timestamp: "2025-01-05T10:01:00.000Z",
          positionLat: 40.7130,
          positionLong: -74.0058,
          altitude: 12.0,
          distance: 150,
          speed: 2.5,
          heartRate: 120,
          power: 180,
          cadence: 85
        },
        {
          timestamp: "2025-01-05T10:02:00.000Z",
          positionLat: 40.7135,
          positionLong: -74.0055,
          altitude: 15.0,
          distance: 300,
          speed: 3.2,
          heartRate: 135,
          power: 220,
          cadence: 90,
          temperature: 22
        }
      ],
      eventMessages: [
        {
          timestamp: "2025-01-05T10:00:00.000Z",
          event: "timer",
          eventType: "start",
          data: 0
        },
        {
          timestamp: "2025-01-05T11:30:00.000Z",
          event: "timer",
          eventType: "stop",
          data: 0
        }
      ],
      hrMessages: [
        {
          timestamp: "2025-01-05T10:01:30.000Z",
          heartRate: 125
        }
      ],
      hrvMessages: [
        {
          timestamp: "2025-01-05T10:01:00.000Z",
          time: [800, 850, 820, 790, 810]
        }
      ],
      liveMetrics: {
        duration: 5400,
        distance: 12500,
        avgPace: 4.32,
        avgHeartRate: 128,
        maxHeartRate: 155,
        avgPower: 195,
        maxPower: 280,
        avgCadence: 88,
        maxCadence: 95,
        avgSpeed: 2.31,
        maxSpeed: 4.8,
        calories: 450,
        totalAscent: 120,
        totalDescent: 85,
        maxElevation: 25,
        minElevation: 8
      },
      status: "stopped"
    }
  }

  try {
    console.log('Testing Edge Function with payload...')

    const response = await fetch('http://127.0.0.1:54321/functions/v1/json-to-fit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
      },
      body: JSON.stringify(testPayload)
    })

    const result = await response.json()

    if (response.ok) {
      console.log('✅ Edge Function test successful!')
      console.log(`Activity ID: ${result.activityId}`)
      console.log(`FIT file path: ${result.fitPath}`)
      console.log(`FIT file size: ${result.fitSize} bytes`)
      console.log(`Record count: ${result.recordCount}`)
      console.log(`Duration: ${result.duration}s`)
    } else {
      console.log('❌ Edge Function test failed!')
      console.log('Error:', result.error)
    }
  } catch (error) {
    console.log('❌ Test failed with exception:', error.message)
  }
}

testEdgeFunction()
