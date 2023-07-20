# Calendar

The Calendar example shows how you can capture user intent as a sequence of actions, such as adding event to a calendar or searching for an event as defined by the [`CalendarActions`](./src/calendarActionsSchema.ts) type.

# Try Calendar
To run the Calendar example, follow the instructions in the [examples README](../README.md#step-1-configure-your-development-environment).

# Usage
Example prompts can be found at [`src/input.txt`](./src/input.txt).

For example, I could use natural language to describe an event coming up soon:

**Input**:
```
📅> I need to get my tires changed from 12:00 to 2:00 pm on Friday March 15, 2024
```

**Output**:
```json
{
  "actions": [
    {
      "actionType": "add event",
      "event": {
        "day": "Friday March 15, 2024",
        "timeRange": {
          "startTime": "12:00 pm",
          "endTime": "2:00 pm"
        },
        "description": "get my tires changed"
      }
    }
  ]
}
```