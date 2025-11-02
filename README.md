# AI Creative Agent Platform

## Executive Summary

The AI Creative Agent Platform is a comprehensive, enterprise-grade solution designed to revolutionize digital advertising through artificial intelligence. Built as a full-stack application with microservices architecture, the platform combines advanced AI capabilities with robust data management to deliver intelligent ad creative generation, competitive intelligence, and collaborative workspace management.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Core Features](#core-features)
4. [Technology Stack](#technology-stack)
5. [Configuration](#Configuration)
6. [API Documentation](#api-documentation)
7. [Development Workflow](#development-workflow)
8. [Deployment](#deployment)
9. [Advanced Technologies](#advanced-technologies)
10. [Security](#security)
11. [Contributing](#contributing)
12. [License](#license)

## Overview

### Mission Statement

To empower marketing teams with AI-driven creative intelligence, enabling data-driven decision making and automated ad creative generation at scale.

### Key Value Propositions

- **AI-Powered Creative Generation**: Leverage advanced AI models to generate high-quality ad variants automatically
- **Competitive Intelligence**: Comprehensive ad monitoring and analysis using SerpAPI integration
- **Multi-Tenant Workspace Management**: Secure, scalable collaborative environments for marketing teams
- **Token-Based Billing System**: Flexible consumption-based pricing with Stripe integration
- **Real-Time Processing**: Asynchronous task processing with Celery for optimal performance

### Target Audience

- **Marketing Agencies**: Managing multiple client campaigns with diverse creative requirements
- **Enterprise Marketing Teams**: Large-scale ad creative management and optimization
- **Digital Marketing Professionals**: Individual practitioners seeking AI-powered creative assistance
- **Creative Directors**: Teams requiring collaborative creative development workflows

## Architecture

### System Architecture Overview

The platform follows a modern microservices architecture with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend Layer (Next.js)                 │
├─────────────────────────────────────────────────────────────┤
│                    API Gateway (Nginx)                       │
├─────────────────────────────────────────────────────────────┤
│  Backend Services (Django REST API)                         │
│  ├── AdSpark Module (Competitive Intelligence)             │
│  ├── AI Agent Module (Creative Generation)                │
│  ├── Workspace Module (Multi-Tenant Management)            │
│  ├── Billing Module (Subscription & Token Management)      │
│  ├── Assets Module (Digital Asset Management)              │
│  └── Campaigns Module (Campaign Management)                │
├─────────────────────────────────────────────────────────────┤
│  Background Processing (Celery Workers)                     │
│  ├── Default Queue (General Tasks)                         │
│  ├── Data Fetch Queue (API Integration)                    │
│  ├── AI Generation Queue (Creative Processing)             │
│  ├── Assets Queue (File Processing)                        │
│  └── Maintenance Queue (System Cleanup)                    │
├─────────────────────────────────────────────────────────────┤
│  Data Layer                                                 │
│  ├── PostgreSQL (Primary Database)                         │
│  └── Redis (Message Broker & Cache)                       │
└─────────────────────────────────────────────────────────────┘
```

### Core Components

#### 1. Frontend Application (Next.js)
- **Technology**: React 18, Next.js 14, TypeScript
- **UI Framework**: Tailwind CSS with Heroicons
- **Authentication**: NextAuth.js with JWT tokens
- **State Management**: React hooks with Axios for API communication
- **Features**: Responsive design, real-time updates, collaborative interfaces

#### 2. Backend API (Django REST Framework)
- **Technology**: Django 5.2, Django REST Framework 3.16
- **Architecture**: Modular Django apps with clear separation
- **Authentication**: Token-based authentication with role-based access control
- **API Design**: RESTful APIs with comprehensive filtering and pagination

#### 3. Background Processing (Celery)
- **Message Broker**: Redis for task queue management
- **Workers**: Specialized workers for different task types
- **Scheduling**: Celery Beat for periodic tasks
- **Monitoring**: Flower dashboard for task monitoring

#### 4. Data Storage
- **Primary Database**: PostgreSQL 15 with optimized indexing
- **Cache Layer**: Redis for session management and caching
- **File Storage**: Local file system with workspace isolation

## Core Features

### 1. AdSpark - Competitive Intelligence Module

**Purpose**: Comprehensive competitive ad monitoring and analysis

**Key Capabilities**:
- **Automated Data Collection**: Integration with SerpAPI Google Ads Transparency Center
- **Advanced Filtering**: Filter by advertiser, domain, region, platform, and creative format
- **Analytics Dashboard**: Timeline analysis, size distribution, and statistical insights
- **Scheduled Monitoring**: Automated data fetching with configurable watch parameters
- **Data Management**: Automatic upsert functionality with duplicate detection

**Technical Implementation**:
- SerpAPI integration for real-time ad data collection
- Celery-based asynchronous data processing
- Advanced filtering and search capabilities
- Comprehensive analytics and reporting

### 2. AI Agent - Creative Generation Module

**Purpose**: AI-powered ad creative variant generation

**Key Capabilities**:
- **Intelligent Creative Generation**: Generate ad variants using advanced AI models
- **Multi-Platform Support**: Support for various ad formats and platforms
- **Quality Assessment**: Confidence scoring and quality metrics
- **Batch Processing**: Handle multiple creative generations simultaneously
- **Feedback Integration**: User feedback collection for model improvement

**Technical Implementation**:
- Dify API integration for AI workflow execution
- Asynchronous processing with Celery workers
- Screenshot generation and media processing
- Comprehensive metadata tracking

### 3. Workspace Management - Multi-Tenant Architecture

**Purpose**: Secure, scalable collaborative environments

**Key Capabilities**:
- **Team Collaboration**: Role-based access control with hierarchical permissions
- **Resource Isolation**: Complete data and asset isolation between workspaces
- **Invitation System**: Secure team member onboarding with invitation links
- **Usage Tracking**: Comprehensive audit trails and usage analytics
- **Subscription Management**: Flexible plan management with resource limits

**Technical Implementation**:
- UUID-based workspace identification
- Fine-grained permission system
- Secure invitation link generation
- Resource limit enforcement

### 4. Billing System - Token-Based Consumption Model

**Purpose**: Flexible, consumption-based pricing with comprehensive billing management

**Key Capabilities**:
- **Token Management**: Credit-based system for AI service consumption
- **Subscription Plans**: Multiple tiers (Free, Basic, Pro, Enterprise)
- **Payment Processing**: Stripe integration for secure transactions
- **Usage Analytics**: Detailed consumption tracking and reporting
- **Billing Automation**: Automated billing cycles and invoice generation

**Technical Implementation**:
- Stripe integration for payment processing
- Token transaction tracking
- Automated billing workflows
- Comprehensive financial reporting

### 5. Asset Management - Digital Asset Organization

**Purpose**: Comprehensive digital asset management and organization

**Key Capabilities**:
- **File Upload & Storage**: Secure file upload with workspace isolation
- **Metadata Management**: Comprehensive asset tagging and categorization
- **Access Control**: Permission-based asset access
- **Asset Processing**: Image optimization and format conversion
- **Search & Discovery**: Advanced search capabilities across assets

**Technical Implementation**:
- Secure file storage with workspace isolation
- Metadata extraction and indexing
- Image processing and optimization
- Advanced search and filtering

### 6. Campaign Management - Campaign Lifecycle Management

**Purpose**: End-to-end campaign management and optimization

**Key Capabilities**:
- **Campaign Creation**: Comprehensive campaign setup and configuration
- **Status Workflows**: Automated status transitions and approvals
- **Team Collaboration**: Multi-user campaign management
- **Budget Tracking**: Real-time budget monitoring and alerts
- **Performance Analytics**: Comprehensive campaign metrics and reporting

**Technical Implementation**:
- Workflow-based status management
- Real-time collaboration features
- Advanced analytics and reporting
- Integration with other platform modules

## Technology Stack

### Backend Technologies
- **Framework**: Django 5.2.6 with Django REST Framework 3.16.1
- **Database**: PostgreSQL 15 with optimized indexing
- **Cache**: Redis 7 for session management and caching
- **Task Queue**: Celery 5.5.3 with Redis broker
- **Authentication**: Django REST Framework token authentication
- **API Documentation**: OpenAPI 3.0 specification
- **Payment Processing**: Stripe 8.5.0 integration

### Frontend Technologies
- **Framework**: Next.js 14.0.4 with React 18
- **Language**: TypeScript 5.9.3 for type safety
- **Styling**: Tailwind CSS 3.4.17 with responsive design
- **Authentication**: NextAuth.js 4.24.11 with JWT
- **HTTP Client**: Axios 1.6.7 for API communication
- **UI Components**: Heroicons 2.0.18 for consistent iconography

### Infrastructure & DevOps
- **Containerization**: Docker with multi-stage builds
- **Orchestration**: Docker Compose for development and production
- **Web Server**: Nginx for reverse proxy and static file serving
- **Process Management**: Gunicorn for WSGI application serving
- **Monitoring**: Flower for Celery task monitoring
- **Development Tools**: Hot reloading, debugging support

### External Integrations
- **AI Services**: Dify API for AI workflow execution
- **Data Sources**: SerpAPI for competitive intelligence
- **Payment Processing**: Stripe for subscription management
- **Search Services**: Google Search integration for data collection

## Configuration（From the github repository）

### Prerequisites

- **Docker**: Version 20.10+ with Docker Compose
- **Node.js**: Version 18+ (for local frontend development)
- **Python**: Version 3.11+ (for local backend development)
- **Git**: For version control and repository management

### Environment Configuration

1. **Clone the Repository**:
```bash
git clone <repository-url>
cd ELEC5620-GROUP10-AI-Creative-Agent
```

2. **Environment Variables Setup**:
```bash
cp env.example .env
```

Configure the following environment variables in `.env`:

```env
not showing sensitive data here....

```

### Development Setup

#### Option 1: Docker Development Environment (Recommended)

1. **Start Development Services**:
```bash
docker-compose -f docker-compose.dev.yml up --build
```

2. **Confirm the Ngrok temporary public tunnel address for the current local service (HTTPS)**:
```bash
docker compose -f docker-compose.dev.yml logs -f ngrok
```
Public URL format: https://xxxx.ngrok-free.dev

3. **Updating public URLs via scripts**:
```bash
powershell -ExecutionPolicy Bypass -File .\scripts\update-ngrok-domain.ps1
```
4. **Rerunning the container**:
```bash
docker compose -f docker-compose.dev.yml up
```

5. **Access Services**:
- **Frontend**: Public URL
- **Backend API**: http://localhost:8000
- **Admin Interface**: http://localhost:8000/admin
- **Flower Dashboard**: http://localhost:5555

#### Option 2: Local Development Setup

1. **Backend Setup**:
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

2. **Frontend Setup**:
```bash
cd frontend
npm install
npm run dev
```

3. **Celery Setup**:
```bash
# Terminal 1: Start Redis
redis-server

# Terminal 2: Start Celery Worker
celery -A backend worker --loglevel=info

# Terminal 3: Start Celery Beat
celery -A backend beat --loglevel=info
```

### Production Setup

1. **Production Environment**:
```bash
docker-compose up -d
```

2. **Database Setup**:
```bash
docker-compose exec backend python manage.py migrate
docker-compose exec backend python manage.py collectstatic
```

3. **SSL Configuration** (Optional):
Configure SSL certificates in nginx configuration for HTTPS support.

## API Documentation

### Authentication

The API uses token-based authentication. Include the token in the Authorization header:

```http
Authorization: Token your_auth_token_here
```

### Core API Endpoints

#### AdSpark Module
- `GET /api/adspark/creatives/` - List ad creatives with filtering
- `GET /api/adspark/creatives/{id}/` - Get specific creative details
- `GET /api/adspark/advertisers/` - List advertisers
- `POST /api/adspark/watches/` - Create monitoring watch

#### AI Agent Module
- `POST /api/ai-agent/variants/` - Generate ad variant
- `GET /api/ai-agent/variants/` - List generated variants
- `GET /api/ai-agent/variants/{id}/` - Get variant details
- `POST /api/ai-agent/variants/{id}/feedback/` - Submit feedback

#### Workspace Management
- `GET /api/workspaces/` - List user workspaces
- `POST /api/workspaces/` - Create new workspace
- `GET /api/workspaces/{id}/members/` - List workspace members
- `POST /api/workspaces/{id}/invite/` - Invite team members

#### Asset Management
- `POST /api/workspaces/{id}/upload/` - Upload assets
- `GET /api/workspaces/{id}/assets/` - List workspace assets
- `GET /api/workspaces/{id}/assets/{asset_id}/` - Get asset details
- `DELETE /api/workspaces/{id}/assets/{asset_id}/` - Delete asset

#### Campaign Management
- `GET /api/campaigns/` - List campaigns
- `POST /api/campaigns/` - Create campaign
- `GET /api/campaigns/{id}/` - Get campaign details
- `PUT /api/campaigns/{id}/` - Update campaign

### API Response Format

All API responses follow a consistent format:

```json
{
  "count": 100,
  "next": "http://api.example.com/items/?page=2",
  "previous": null,
  "results": [...]
}
```

### Error Handling

The API returns appropriate HTTP status codes and error messages:

```json
{
  "error": "Validation failed",
  "details": {
    "field_name": ["Error message"]
  }
}
```

## Development Workflow

### Code Organization

```
ELEC5620-GROUP10-AI-Creative-Agent/
├── backend/                    # Django backend application
│   ├── AdSpark/              # Competitive intelligence module
│   ├── ai_agent/             # AI creative generation module
│   ├── workspace/            # Multi-tenant workspace management
│   ├── billing/              # Subscription and billing management
│   ├── assets/               # Digital asset management
│   ├── campaigns/            # Campaign management
│   ├── accounts/             # User authentication and management
│   └── backend/              # Django project configuration
├── frontend/                  # Next.js frontend application
│   ├── src/
│   │   ├── app/              # Next.js app router pages
│   │   ├── components/       # Reusable React components
│   │   └── lib/              # Utility functions and configurations
├── nginx/                     # Nginx configuration
├── docker-compose.yml         # Production Docker configuration
├── docker-compose.dev.yml     # Development Docker configuration
└── README.md                  # This documentation
```

### Development Guidelines

1. **Code Style**: Follow PEP 8 for Python and ESLint for JavaScript/TypeScript
2. **Testing**: Write comprehensive tests for all new features
3. **Documentation**: Update API documentation for new endpoints
4. **Security**: Implement proper authentication and authorization
5. **Performance**: Optimize database queries and API responses

### Testing Strategy

1. **Unit Tests**: Test individual components and functions
2. **Integration Tests**: Test module interactions
3. **API Tests**: Test REST API endpoints
4. **End-to-End Tests**: Test complete user workflows

### Git Workflow

1. **Feature Branches**: Create feature branches for new development
2. **Pull Requests**: Submit pull requests for code review
3. **Code Review**: Mandatory code review for all changes
4. **Continuous Integration**: Automated testing on pull requests

## Deployment

### Production Architecture

The production deployment uses Docker containers with the following services:

- **Web Server**: Nginx for reverse proxy and static file serving
- **Application Server**: Django with Gunicorn WSGI server
- **Database**: PostgreSQL with persistent volumes
- **Cache**: Redis for session management and caching
- **Task Queue**: Celery workers for background processing
- **Monitoring**: Flower dashboard for task monitoring

### Deployment Steps

1. **Environment Setup**:
```bash
# Configure production environment variables
cp env.example .env
# Edit .env with production values
```
Refer to the .env example in the Environment Configuration section.

2. **Database Migration**:
```bash
docker-compose exec backend python manage.py migrate
docker-compose exec backend python manage.py collectstatic --noinput
```

3. **Service Startup**:
```bash
docker-compose up -d
```

4. **Health Checks**:
```bash
# Check service status
docker-compose ps

# Check logs
docker-compose logs -f
```

### Scaling Considerations

- **Horizontal Scaling**: Add more Celery workers for increased processing capacity
- **Database Optimization**: Implement read replicas for read-heavy workloads
- **Caching Strategy**: Implement Redis clustering for high availability
- **Load Balancing**: Use multiple Nginx instances with load balancer

## Advanced Technologies

This platform applies a set of advanced technologies to ensure scalability, reliability and developer velocity:

- **Dify (AI Orchestration)**
  - Used to orchestrate AI workflows for creative generation and evaluation.
  - Integrates via secure API keys; long-running jobs are executed asynchronously through Celery.

- **Docker Containerization**
  - Backend (Django), Frontend (Next.js), Celery workers/beat, Redis, Postgres, Nginx all run as isolated services.
  - Reproducible environments across dev/staging/prod; one-command bring-up with `docker compose`.

- **CI/CD Pipeline**
  - CI: lint/test/build on each PR/commit to `main`.
  - CD: build & push images, then deploy via `docker compose` on the target host; migrations/collectstatic executed post-deploy.

- **ngrok Tunnel**
  - Provides a **temporary public URL** for local services (e.g., webhooks, quick demos).
  - Traffic terminates at ngrok edge and tunnels to `localhost`.

- **Nginx Reverse Proxy**
  - Terminates HTTPS, routes traffic to Gunicorn (Django) and serves static assets.
  - Supports caching headers/compression and isolates upstream services.

- **Frameworks**
  - **Django + Django REST Framework** for API, auth, RBAC, ORM, admin and serialization.
  - **Next.js (React 18)** for the frontend app router, SSR/SSG, and production bundling.

## Security

### Authentication & Authorization

- **Token-Based Authentication**: Secure API access with JWT tokens
- **Role-Based Access Control**: Hierarchical permission system
- **Workspace Isolation**: Complete data isolation between tenants
- **Session Management**: Secure session handling with Redis

### Data Protection

- **Input Validation**: Comprehensive input sanitization and validation
- **SQL Injection Prevention**: Parameterized queries and ORM usage
- **XSS Protection**: Content Security Policy and input escaping
- **CSRF Protection**: Cross-Site Request Forgery prevention

### Infrastructure Security

- **Container Security**: Regular security updates and vulnerability scanning
- **Network Security**: Isolated container networks
- **Secrets Management**: Environment variable-based configuration
- **SSL/TLS**: HTTPS enforcement for all communications

## Contributing

### Development Setup

1. **Fork the Repository**: Create your own fork of the project
2. **Clone Your Fork**: Clone your fork to your local machine
3. **Create Feature Branch**: Create a new branch for your feature
4. **Make Changes**: Implement your changes with proper testing
5. **Submit Pull Request**: Submit a pull request for review

### Contribution Guidelines

1. **Code Quality**: Maintain high code quality standards
2. **Testing**: Include comprehensive tests for new features
3. **Documentation**: Update documentation for API changes
4. **Security**: Follow security best practices
5. **Performance**: Consider performance implications of changes

### Code Review Process

1. **Automated Checks**: All pull requests must pass automated tests
2. **Manual Review**: At least one team member must review changes
3. **Security Review**: Security-sensitive changes require additional review
4. **Performance Review**: Performance-impacting changes require analysis

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support & Contact

For technical support, feature requests, or general inquiries:

- **Documentation**: Refer to this README and inline code documentation
- **Issues**: Submit issues through the project's issue tracker
- **Discussions**: Use the project's discussion forum for questions
- **Email**: Contact the development team for urgent matters

---

**Version**: 1.0.0  
**Last Updated**: January 2025  
**Maintainer**: ELEC5620 Group 10 Development Team