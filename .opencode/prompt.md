Objective:

To enhance the organization and scalability of our project, we are implementing a new standardized structure for change logging, documentation, and agent configurations. Please follow the guidelines below to refactor and establish these new standards within the repository.
1. CHANGELOG.md Implementation

We need a minimal, consistently formatted CHANGELOG.md file at the root of the project.

    Format: All new entries must be added under the template Changelog record.

    Use this exact template:
    markdown

    # Changelog

    All notable changes to this project will be documented in this file.

    ---

    ## `[Version.Number] - YYYY-MM-DD`: Description of change

    - copy entire template and horizontal divider
    - paste under a new line

    ---

    ## [1.0.0] - 2026-01-22: Initial Release

    - Initial release of the application.
    - Update to application.

2. docs Directory for Persistent Documentation

Create a docs directory at the project root. This directory is exclusively for critical, long-term documentation. For Example:

    Third-party integration details (Wahoo, Strava).

    Garmin Fit SDK information.

Implement the following directory structure:

docs/
├── integrations/
├── garmin-fit-sdk/

3. Agent Configuration in .opencode/specs

All agent design and planning documents must now live within the .opencode directory, following a strict structure.

    Location: Create a specs folder inside the .opencode directory.

    Topic Folders: Inside specs, each new unit of work (e.g., a feature, a bug fix) must have its own dedicated folder named using the format: {date}-{topicname} (e.g., 2026-01-22-user-authentication-flow).

    Standard Files: Each topic folder must contain the following three files, adhering to the specified standards:

        design.md: A high-level document explaining the what and why.

        plan.md: A technical document breaking the work into phases and steps.

        tasks.md: A granular checklist of all individual tasks to be completed.

    Contextual Files: Any other files (e.g., .json examples, notes, research) can be included in the topic folder for reference.

Action

Please initialize this new structure in the repository and ensure all future development adheres to these standards. Move any existing relevant documentation into the new docs directory.
