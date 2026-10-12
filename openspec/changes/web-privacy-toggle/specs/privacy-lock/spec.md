## ADDED Requirements

### Requirement: Web automatic privacy preference
Web SHALL offer an automatic privacy switch in privacy settings and persist it in localStorage as `privacy_enabled`. Missing preferences SHALL preserve the existing enabled default. Disabling SHALL stop automatic locking and hide its countdown, while preserving timeout and countdown preferences. Enabling SHALL start a fresh inactivity timer. Preference updates SHALL synchronize across mounted consumers and browser tabs without API requests.

#### Scenario: Disable and revisit the feed
- **WHEN** the user disables automatic privacy and reloads or returns to the feed
- **THEN** inactivity SHALL NOT trigger automatic locking

#### Scenario: Re-enable after disabling
- **WHEN** the user enables automatic privacy again
- **THEN** the saved timeout and countdown preferences SHALL remain available and the feed SHALL lock after a fresh inactivity period

#### Scenario: Already locked page
- **WHEN** another tab disables automatic privacy
- **THEN** existing locked-page state SHALL NOT be removed by the preference change
