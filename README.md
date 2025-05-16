# linear-pr

A CLI tool to create GitHub PRs from Linear tasks with standardized naming conventions.

## Features

- Create GitHub PRs directly from Linear task IDs or branch names
- Extract Linear task details automatically
- Preserve exact branch names like `feature/team-1234-cool-feature`
- Format PR titles consistently with Linear task references
- Support for both Linear API keys and OAuth authentication
- Automatic module name detection from Linear projects

## Installation

```bash
npm install -g linear-pr
```

## Quick Start

### Setup

```bash
# Configure Linear and GitHub credentials
linear-pr setup
```

### Create a PR

```bash
# From a Linear task ID
linear-pr create TASK-123 -t feat -m auth

# From a branch name (preserves exact branch name)
linear-pr create feature/team-123-new-feature
```

## Usage

### Creating a PR

#### With Exact Branch Name

```bash
linear-pr create feature/team-1234-cool-feature
```

This will:
1. Use exactly the branch name you provided 
2. Extract the task ID from the branch name
3. Create a draft PR with standardized title format

#### Available Options

- `-t, --type <type>`: PR type (feat, fix, chore, etc.) Default: `feat`
- `-m, --module <module>`: Module/component name (uses Linear project name if available)
- `-a, --enforce-assignment`: Only allow PRs for tasks assigned to you

## Examples

### Creating a Feature PR

```bash
# Using a Linear task ID
linear-pr create ENG-123 -t feat -m authentication

# Result: "feat(authentication): [ENG-123] Task title from Linear"
```

### Creating a Bug Fix PR

```bash
# Using a branch name
linear-pr create bug/utxhk-456-fix-login-issue -t fix

# Result: "fix(project-name): [UTXHK-456] Fix login issue"
# (module name is automatically taken from the Linear project)
```

### Creating a PR for a Task Assigned to You

```bash
# Only works if you're assigned to the task
linear-pr create TEAM-789 -t chore -m cleanup -a

# Result: "chore(cleanup): [TEAM-789] Task title from Linear"
```

### Preserving Complex Branch Names

```bash
# Branch with slashes and special characters
linear-pr create feature/team-1234-cool-feature -t feat -m integration

# Branch is preserved as: "feature/team-1234-cool-feature"
# PR title: "feat(integration): [TEAM-1234] Cool Feature"
```

## PR Title Format

All PRs follow the format: `{type}({module}): [{linear task number}] {description}`

Example: `feat(auth): [TEAM-123] Add authentication flow`

## Authentication

Supports both Personal API keys and OAuth2 for Linear authentication. Run `linear-pr setup` to configure.

## Development and Publishing

### Local Development

```bash
# Clone the repository
git clone https://github.com/sagar.saud/linear-pr.git
cd linear-pr

# Install dependencies
npm install

# Build the package
npm run build

# Link for local testing
npm link
```

## License

MIT 