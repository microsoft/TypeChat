# Education

The Education example shows how you can capture user intent as a sequence of queries, such as getting lab usage, number of labs etc. [`CalendarActions`](./src/calendarActionsSchema.ts) type.

# Try Calendar

To run the Calendar example, follow the instructions in the [examples README](../README.md#step-1-configure-your-development-environment).

# Usage

Example prompts can be found in [`src/input.txt`](./src/input.txt).

For example, we could use natural language to describe an event coming up soon:

**Input**:

```
📅> Create a grant for my professor, What labs do I have?
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