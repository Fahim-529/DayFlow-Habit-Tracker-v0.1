# DayFlow bug-fix notes

## Habit scheduling and Today tab

The Habits screen stores habit definitions in IndexedDB, while the Today screen displays scheduled-task records. Previously, the Today screen only read scheduled tasks and never converted active habits into daily task instances, so a successfully created habit could remain invisible in Today.

The Today screen now materializes applicable active habits into scheduled tasks for the selected date before rendering. It supports daily, weekdays (Monday-Friday unless explicit weekdays are configured), weekly (same weekday as the start date), and one-time habits. It respects start/end dates, carries the habit's tracking settings into the task, and checks existing records to avoid duplicates when a date is revisited.

## Related fixes

- Moving a task and evaluating recovery now use the user's full scheduled-task list for workload/dependency checks rather than only the currently displayed date.
- Habit creation resets the captured form element after saving, avoiding use of React's transient `event.currentTarget` after an async operation.
- Habit default dates use the local calendar date instead of the UTC date string.

## Validation

Dependency installation timed out in the build environment, so the TypeScript/test suite could not be validated here. On Windows with Node.js 20+, run `npm install`, `npm run type-check`, `npm test`, and `npm run build` before relying on a production build.
