.PHONY: install test lint format clean run db-upgrade db-downgrade db-migrate db-init

# Install dependencies
install:
	pip install -r requirements.txt

# Run tests
test:
	pytest tests/

# Lint the code
lint:
	flake8 .
	black --check .

# Format the code
format:
	black .
	run:
	flask run

# Initialize the database
db-init:
	flask db init

# Create a new migration
db-migrate:
	flask db migrate -m "$(msg)"

# Upgrade the database
db-upgrade:
	flask db upgrade

# Downgrade the database
db-downgrade:
	flask db downgrade

# Clean up Python cache files
clean:
	find . -type d -name "__pycache__" -exec rm -r {} +
	find . -type d -name ".pytest_cache" -exec rm -r {} +
	find . -name "*.pyc" -delete
	find . -name "*.pyo" -delete
	find . -name "*~" -delete

# Run the application in development mode
dev:
	FLASK_APP=run.py FLASK_ENV=development flask run --host=0.0.0.0 --port=5000

# Run the application in production mode
prod:
	gunicorn -w 4 -b 0.0.0.0:5000 wsgi:application

# Run the application with docker-compose
docker-up:
	docker-compose up --build

# Stop and remove docker containers
docker-down:
	docker-compose down -v

# Show logs from docker containers
docker-logs:
	docker-compose logs -f

# Run tests with coverage
coverage:
	coverage run -m pytest
	coverage report -m
	coverage html

# Create a new admin user
create-admin:
	python manage.py create_admin
