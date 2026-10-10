## ADDED Requirements

### Requirement: Feed requests follow user intent
Clients SHALL issue one feed request for one settled filter change and zero requests for selecting the current filter. Initial authenticated Web loading SHALL need only current user, feed and tags requests. Focus events within one second SHALL share one refresh cycle.

#### Scenario: Tags arrive after feed initialization
- **WHEN** the tag list resolves without changing the selected tag name
- **THEN** the client SHALL NOT reload the feed

### Requirement: Comment previews are bounded
Record responses SHALL include at most three comment previews and a revision token. New clients SHALL use those previews without a comment GET during card mounting. Full comments SHALL load in explicit pages. Existing requests without page SHALL preserve their array response.

#### Scenario: A page contains one hundred commented records
- **WHEN** the client displays the page
- **THEN** comment HTTP requests SHALL NOT grow with record count and backend SQL queries SHALL remain bounded

### Requirement: Reusable data is session isolated
Comment and protected image caches SHALL be scoped to the server and logical login session, reject obsolete in-flight completions, and invalidate after relevant mutations. Token refresh SHALL preserve the logical session.

#### Scenario: Same account signs in again
- **WHEN** an old read finishes after a new login
- **THEN** its result SHALL NOT populate the new session cache

### Requirement: Request budgets are verified with behavior
Regression checks SHALL verify visible results and request counts, including filtering, focus, editor cancellation, undo, comment pagination, remote changes and repeated images. Reports SHALL distinguish browser measurements from unit tests and static analysis.

#### Scenario: Cancel editing or undo a pending deletion
- **WHEN** a commented card remounts with its existing preview
- **THEN** the operation SHALL issue zero API requests
