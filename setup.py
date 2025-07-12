from setuptools import setup, find_packages

with open('README.md', 'r', encoding='utf-8') as f:
    long_description = f.read()

setup(
    name='product-calculator',
    version='1.0.0',
    description='A product calculation and quotation management system',
    long_description=long_description,
    long_description_content_type='text/markdown',
    author='Your Name',
    author_email='your.email@example.com',
    url='https://github.com/yourusername/product-calculator',
    packages=find_packages(),
    include_package_data=True,
    zip_safe=False,
    install_requires=[
        'Flask==2.3.3',
        'Flask-Login==0.6.2',
        'Flask-SQLAlchemy==3.1.1',
        'Flask-WTF==1.2.2',
        'Flask-CORS==4.0.0',
        'Flask-Migrate==4.0.5',
        'Flask-Script==2.0.6',
        'Werkzeug==2.3.7',
        'Jinja2==3.1.2',
        'MarkupSafe==2.1.3',
        'itsdangerous==2.1.2',
        'python-dotenv==1.0.0',
        'email-validator==2.0.0',
        'psycopg2-binary==2.9.10',
        'SQLAlchemy==2.0.21',
        'alembic==1.12.1',
        'python-dateutil==2.8.2',
        'python-editor==1.0.4',
        'six==1.16.0',
    ],
    python_requires='>=3.8',
    classifiers=[
        'Development Status :: 4 - Beta',
        'Environment :: Web Environment',
        'Framework :: Flask',
        'Intended Audience :: End Users/Desktop',
        'License :: OSI Approved :: MIT License',
        'Operating System :: OS Independent',
        'Programming Language :: Python :: 3',
        'Programming Language :: Python :: 3.8',
        'Programming Language :: Python :: 3.9',
        'Programming Language :: Python :: 3.10',
        'Topic :: Internet :: WWW/HTTP :: Dynamic Content',
        'Topic :: Office/Business :: Financial :: Spreadsheet',
    ],
    entry_points={
        'console_scripts': [
            'product-calculator=manage:main',
        ],
    },
)
