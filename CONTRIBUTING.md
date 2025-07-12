# Contributing to Product Calculator

Thank you for your interest in contributing to the Product Calculator project! We welcome all contributions, whether they're bug reports, feature requests, documentation improvements, or code contributions.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Setting Up the Development Environment](#setting-up-the-development-environment)
- [Making Changes](#making-changes)
  - [Code Style](#code-style)
  - [Testing](#testing)
  - [Documentation](#documentation)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Reporting Bugs](#reporting-bugs)
- [Feature Requests](#feature-requests)
- [License](#license)

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## Getting Started

### Prerequisites

- Python 3.8 or higher
- pip (Python package manager)
- Git
- SQLite (default) or PostgreSQL/MySQL database

### Setting Up the Development Environment

1. **Fork the repository** on GitHub.
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/your-username/product-calculator.git
   cd product-calculator
   ```
3. **Set up a virtual environment**:
   ```bash
   # On Windows
   python -m venv venv
   .\venv\Scripts\activate
   
   # On macOS/Linux
   python3 -m venv venv
   source venv/bin/activate
   ```
4. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   pip install -r requirements-dev.txt  # Development dependencies
   ```
5. **Set up environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```
6. **Initialize the database**:
   ```bash
   python manage.py db init
   python manage.py db migrate -m "Initial migration"
   python manage.py db upgrade
   ```

## Making Changes

1. **Create a new branch** for your feature or bugfix:
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b bugfix/issue-number-short-description
   ```
2. **Make your changes** following the code style guidelines.
3. **Write tests** for your changes.
4. **Run the tests** to ensure everything works:
   ```bash
   make test
   ```
5. **Commit your changes** with a descriptive commit message:
   ```bash
   git commit -m "Add feature: short description of changes"
   ```

### Code Style

We use the following tools to maintain code quality:

- **Black** for code formatting
- **Flake8** for linting
- **isort** for import sorting

Run the following commands before committing:

```bash
make format  # Auto-format your code
make lint    # Check for linting errors
```

### Testing

Write tests for any new functionality or bug fixes. We use `pytest` for testing.

```bash
# Run all tests
pytest

# Run a specific test file
pytest tests/test_module.py

# Run tests with coverage
pytest --cov=app tests/
```

### Documentation

Update the relevant documentation when adding new features or changing existing behavior.

## Submitting a Pull Request

1. **Push your changes** to your fork:
   ```bash
   git push origin your-branch-name
   ```
2. **Open a Pull Request** from your fork to the main repository.
3. **Describe your changes** in the PR description, including:
   - The purpose of the changes
   - Any related issues or PRs
   - Screenshots or examples if applicable
4. **Request a review** from one of the maintainers.

## Reporting Bugs

If you find a bug, please open an issue with the following information:

1. A clear and descriptive title
2. Steps to reproduce the issue
3. Expected vs. actual behavior
4. Screenshots or error messages if applicable
5. Environment information (OS, Python version, etc.)

## Feature Requests

We welcome feature requests! Please open an issue with:

1. A clear and descriptive title
2. A description of the problem you're trying to solve
3. Any alternative solutions you've considered
4. Additional context or screenshots if applicable

## License

By contributing to this project, you agree that your contributions will be licensed under the [MIT License](LICENSE).
