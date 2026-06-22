/**
 * Master Category Ecosystem Seed Script
 * Generates SQL for all subcategories and skills based on categories.
 * 
 * Usage: node scripts/seed-categories.js
 */

// Mapping: category slug → array of subcategory names
// Each subcategory → array of skill names (up to ~5)
const SUBCATEGORY_MAP = {
  'development-it': [
    { name: 'Frontend Development', skills: ['React.js', 'Next.js', 'TypeScript', 'JavaScript ES6+', 'Tailwind CSS'] },
    { name: 'Backend Development', skills: ['Node.js', 'Python', 'Java', 'Go', 'Ruby on Rails'] },
    { name: 'Full Stack Development', skills: ['MERN Stack', 'MEAN Stack', 'Django + React', 'LAMP Stack', 'JAMstack'] },
    { name: 'Mobile Development', skills: ['React Native', 'Flutter', 'Swift', 'Kotlin', 'Ionic'] },
    { name: 'API Development', skills: ['REST APIs', 'GraphQL', 'WebSocket', 'gRPC', 'OpenAPI/Swagger'] },
  ],
  'ai-machine-learning': [
    { name: 'Machine Learning Models', skills: ['Supervised Learning', 'Unsupervised Learning', 'Reinforcement Learning', 'Ensemble Methods', 'Anomaly Detection'] },
    { name: 'Computer Vision', skills: ['OpenCV', 'YOLO', 'Image Classification', 'Object Detection', 'Facial Recognition'] },
    { name: 'NLP', skills: ['BERT', 'GPT Models', 'Text Classification', 'Sentiment Analysis', 'Named Entity Recognition'] },
    { name: 'MLOps', skills: ['MLflow', 'Kubeflow', 'Model Deployment', 'A/B Testing ML', 'Feature Stores'] },
    { name: 'ML Frameworks', skills: ['TensorFlow', 'PyTorch', 'Scikit-learn', 'XGBoost', 'Keras'] },
  ],
  'ai-chatbots': [
    { name: 'Chatbot Platforms', skills: ['Dialogflow', 'Rasa', 'Amazon Lex', 'Microsoft Bot Framework', 'IBM Watson Assistant'] },
    { name: 'LLM Integration', skills: ['OpenAI API', 'LangChain', 'LlamaIndex', 'Hugging Face', 'Claude API'] },
    { name: 'Conversational Design', skills: ['Conversational UI', 'Intent Mapping', 'Dialog Flow Design', 'User Personas', 'Response Templates'] },
    { name: 'Messaging Platforms', skills: ['WhatsApp API', 'Telegram Bot', 'Slack Bot', 'Discord Bot', 'Messenger Bot'] },
    { name: 'Chatbot Analytics', skills: ['Bot Performance Metrics', 'User Analytics', 'Conversation Logs', 'A/B Testing Bots', 'Sentiment Analysis'] },
  ],
  'generative-ai': [
    { name: 'Text Generation', skills: ['GPT-4 Fine-tuning', 'Prompt Engineering', 'Content Generation', 'Story Generation', 'Code Generation'] },
    { name: 'Image Generation', skills: ['Stable Diffusion', 'DALL-E', 'Midjourney', 'ControlNet', 'Image-to-Image'] },
    { name: 'Audio Generation', skills: ['Speech Synthesis', 'Voice Cloning', 'Music Generation', 'Text-to-Speech', 'Audio Enhancement'] },
    { name: 'Video Generation', skills: ['Text-to-Video', 'Video Enhancement', 'Deepfake Detection', 'Animation Generation', 'Video Editing AI'] },
    { name: 'GenAI Applications', skills: ['AI Art Creation', 'Design Generation', '3D Model Generation', 'Code Assistants', 'Data Augmentation'] },
  ],
  'deep-learning': [
    { name: 'Neural Networks', skills: ['CNNs', 'RNNs/LSTMs', 'Transformers', 'GANs', 'Autoencoders'] },
    { name: 'Deep Learning Frameworks', skills: ['PyTorch Deep', 'TensorFlow Deep', 'JAX', 'ONNX', 'CUDA'] },
    { name: 'Model Optimization', skills: ['Model Pruning', 'Quantization', 'Knowledge Distillation', 'Transfer Learning', 'Hyperparameter Tuning'] },
    { name: 'Advanced Architectures', skills: ['Attention Mechanisms', 'Diffusion Models', 'Neural Architecture Search', 'Self-Supervised Learning', 'Few-Shot Learning'] },
    { name: 'Deep Learning Infrastructure', skills: ['GPU Computing', 'Distributed Training', 'Horovod', 'Ray', 'Weights & Biases'] },
  ],
  'ml-engineering': [
    { name: 'ML Pipelines', skills: ['Data Pipelines', 'Feature Engineering', 'Model Training Pipelines', 'Inference Pipelines', 'Monitoring'] },
    { name: 'Model Deployment', skills: ['Docker ML', 'Kubernetes ML', 'AWS SageMaker', 'Azure ML', 'GCP AI Platform'] },
    { name: 'ML Testing', skills: ['Model Validation', 'Bias Detection', 'Data Drift', 'Concept Drift', 'Model Explainability'] },
    { name: 'ML Infrastructure', skills: ['Feature Stores', 'Model Registries', 'Experiment Tracking', 'Hyperparameter Optimization', 'CI/CD for ML'] },
    { name: 'Production ML', skills: ['A/B Testing ML', 'Canary Deployments', 'Shadow Mode', 'Model Versioning', 'SLA Monitoring'] },
  ],
  'data-science': [
    { name: 'Statistical Analysis', skills: ['Hypothesis Testing', 'Regression Analysis', 'Bayesian Statistics', 'Time Series Analysis', 'A/B Testing'] },
    { name: 'Data Visualization', skills: ['Tableau', 'Power BI', 'Matplotlib', 'Seaborn', 'D3.js'] },
    { name: 'Data Wrangling', skills: ['Pandas', 'NumPy', 'Data Cleaning', 'Feature Engineering', 'Data Transformation'] },
    { name: 'Scientific Computing', skills: ['R Programming', 'MATLAB', 'SAS', 'SPSS', 'Julia'] },
    { name: 'Data Storytelling', skills: ['Dashboard Design', 'Data Reporting', 'KPI Tracking', 'Executive Dashboards', 'Data Presentations'] },
  ],
  'data-analytics': [
    { name: 'Business Intelligence', skills: ['Power BI DAX', 'Tableau Prep', 'Looker', 'Metabase', 'QlikView'] },
    { name: 'SQL Analytics', skills: ['Advanced SQL', 'Window Functions', 'CTEs', 'Query Optimization', 'Database Design'] },
    { name: 'Web Analytics', skills: ['Google Analytics 4', 'Mixpanel', 'Amplitude', 'Heap Analytics', 'Hotjar'] },
    { name: 'Product Analytics', skills: ['Funnel Analysis', 'Cohort Analysis', 'Retention Analysis', 'User Segmentation', 'Event Tracking'] },
    { name: 'Reporting', skills: ['Automated Reports', 'KPI Dashboards', 'Executive Summaries', 'Data Warehousing', 'ETL Pipelines'] },
  ],
  'data-engineering': [
    { name: 'ETL/ELT', skills: ['Apache Airflow', 'dbt', 'Fivetran', 'Stitch', 'Informatica'] },
    { name: 'Data Warehousing', skills: ['Snowflake', 'BigQuery', 'Redshift', 'Databricks', 'ClickHouse'] },
    { name: 'Stream Processing', skills: ['Apache Kafka', 'Apache Flink', 'Spark Streaming', 'Kinesis', 'Pub/Sub'] },
    { name: 'Data Lake', skills: ['Apache Spark', 'AWS Lake Formation', 'Delta Lake', 'Apache Iceberg', 'Apache Hudi'] },
    { name: 'Data Modeling', skills: ['Star Schema', 'Data Vault', 'Dimensional Modeling', 'Medallion Architecture', 'Reverse ETL'] },
  ],
  'data-annotation': [
    { name: 'Image Annotation', skills: ['Bounding Boxes', 'Semantic Segmentation', 'Keypoint Annotation', 'Polygon Annotation', '3D Point Cloud'] },
    { name: 'Text Annotation', skills: ['Text Classification', 'NER Labeling', 'Sentiment Labels', 'Entity Linking', 'Relation Extraction'] },
    { name: 'Audio Annotation', skills: ['Speech Transcription', 'Speaker Diarization', 'Audio Event Detection', 'Emotion Labeling', 'Language ID'] },
    { name: 'Video Annotation', skills: ['Video Tracking', 'Action Recognition', 'Frame-by-Frame', 'Object Tracking', 'Scene Detection'] },
    { name: 'Quality Control', skills: ['Annotation Validation', 'Inter-annotator Agreement', 'Data Curation', 'Label Consistency', 'Review Workflows'] },
  ],
  'data-entry': [
    { name: 'Data Entry Services', skills: ['Manual Data Entry', 'Document Digitization', 'Copy-Paste Data', 'Form Filling', 'Web Research'] },
    { name: 'Data Processing', skills: ['Data Cleansing', 'Data Formatting', 'Data Migration', 'Excel Data Entry', 'CSV Processing'] },
    { name: 'Database Management', skills: ['Record Updates', 'Data Deduplication', 'Database Cleanup', 'Data Upload', 'Bulk Updates'] },
    { name: 'Document Management', skills: ['PDF Conversion', 'OCR Processing', 'Document Indexing', 'File Organization', 'Scanning'] },
    { name: 'Web Research', skills: ['Lead Research', 'Contact Finding', 'Market Research', 'Competitor Analysis', 'Data Collection'] },
  ],
  'frontend-development': [
    { name: 'React Ecosystem', skills: ['React.js', 'Next.js', 'Gatsby', 'Remix', 'Vite'] },
    { name: 'Vue Ecosystem', skills: ['Vue 3', 'Nuxt.js', 'Pinia', 'Vite Vue', 'Quasar'] },
    { name: 'Angular Ecosystem', skills: ['Angular 17+', 'RxJS', 'NgRx', 'Angular Material', 'PrimeNG'] },
    { name: 'CSS & Styling', skills: ['Tailwind CSS', 'SCSS/SASS', 'Styled Components', 'CSS Modules', 'Framer Motion'] },
    { name: 'Frontend Testing', skills: ['Jest', 'React Testing Library', 'Cypress', 'Playwright', 'Vitest'] },
  ],
  'backend-development': [
    { name: 'Node.js Backend', skills: ['Express.js', 'NestJS', 'Fastify', 'Socket.io', 'Prisma'] },
    { name: 'Python Backend', skills: ['Django', 'FastAPI', 'Flask', 'SQLAlchemy', 'Celery'] },
    { name: 'Java Backend', skills: ['Spring Boot', 'Micronaut', 'Quarkus', 'Hibernate', 'JPA'] },
    { name: 'Go Backend', skills: ['Gin', 'Echo', 'Fiber', 'GORM', 'Chi Router'] },
    { name: 'API Gateways', skills: ['Kong', 'NGINX', 'Traefik', 'Envoy', 'API Gateway AWS'] },
  ],
  'full-stack-development': [
    { name: 'MERN Stack', skills: ['MongoDB', 'Express.js', 'React.js', 'Node.js', 'Redux'] },
    { name: 'JAMstack', skills: ['Next.js', 'Vercel', 'Sanity CMS', 'Stripe', 'Auth0'] },
    { name: 'LAMP Stack', skills: ['Linux', 'Apache', 'MySQL', 'PHP', 'WordPress'] },
    { name: 'Python Full Stack', skills: ['Django', 'PostgreSQL', 'React', 'Docker', 'Redis'] },
    { name: 'Serverless Stack', skills: ['AWS Lambda', 'Vercel Serverless', 'Netlify Functions', 'Supabase', 'PlanetScale'] },
  ],
  'mobile-app-development': [
    { name: 'Native iOS', skills: ['Swift', 'SwiftUI', 'UIKit', 'Core Data', 'Combine'] },
    { name: 'Native Android', skills: ['Kotlin', 'Jetpack Compose', 'Android SDK', 'Room DB', 'Dagger Hilt'] },
    { name: 'Cross Platform', skills: ['React Native', 'Flutter', 'Xamarin', '.NET MAUI', 'Capacitor'] },
    { name: 'Mobile UI/UX', skills: ['Mobile Prototyping', 'App Design', 'Material Design', 'HIG iOS', 'App Animations'] },
    { name: 'App Store Deployment', skills: ['App Store Connect', 'Google Play Console', 'Code Signing', 'TestFlight', 'In-App Purchases'] },
  ],
  'ios-development': [
    { name: 'iOS Frameworks', skills: ['SwiftUI', 'UIKit', 'Core ML', 'ARKit', 'Metal'] },
    { name: 'iOS Architecture', skills: ['MVVM iOS', 'Combine', 'Swift Concurrency', 'Core Data', 'CloudKit'] },
    { name: 'iOS Networking', skills: ['URLSession', 'Alamofire', 'GraphQL iOS', 'WebSockets', 'Push Notifications'] },
    { name: 'iOS Testing', skills: ['XCTest', 'XCTestUI', 'Quick/Nimble', 'Snapshot Testing', 'Performance Testing'] },
    { name: 'App Store', skills: ['App Store Review', 'TestFlight', 'App Analytics', 'In-App Purchases', 'Subscription Management'] },
  ],
  'android-development': [
    { name: 'Android Frameworks', skills: ['Jetpack Compose', 'Material 3', 'Android Architecture Components', 'Dagger Hilt', 'Room'] },
    { name: 'Android Architecture', skills: ['MVVM Android', 'Clean Architecture', 'MVI', 'Use Cases', 'Repository Pattern'] },
    { name: 'Android Networking', skills: ['Retrofit', 'OkHttp', 'GraphQL Android', 'Firebase', 'WebSocket Android'] },
    { name: 'Android Testing', skills: ['JUnit', 'Espresso', 'MockK', 'Compose Testing', 'Robolectric'] },
    { name: 'Google Play', skills: ['Play Console', 'App Bundles', 'In-App Billing', 'Play Integrity', 'Firebase Analytics'] },
  ],
  'flutter-development': [
    { name: 'Flutter UI', skills: ['Widget Tree', 'Custom Painters', 'Animations', 'Responsive UI', 'Material Flutter'] },
    { name: 'Flutter State', skills: ['Riverpod', 'Bloc', 'Provider', 'GetX', 'Redux Flutter'] },
    { name: 'Flutter Backend', skills: ['Firebase Flutter', 'Supabase Flutter', 'GraphQL Flutter', 'REST Flutter', 'WebSocket Flutter'] },
    { name: 'Flutter Testing', skills: ['Flutter Test', 'Integration Test', 'Widget Test', 'Mockito Flutter', 'Golden Tests'] },
    { name: 'Flutter Platforms', skills: ['iOS Flutter', 'Android Flutter', 'Web Flutter', 'Desktop Flutter', 'Flutter Packages'] },
  ],
  'react-native-development': [
    { name: 'RN Core', skills: ['React Navigation', 'Expo', 'Native Modules', 'Hermes', 'React Native Reanimated'] },
    { name: 'RN State Management', skills: ['Redux Toolkit', 'Zustand', 'MobX', 'Jotai', 'React Query'] },
    { name: 'RN UI', skills: ['Styled Components RN', 'NativeWind', 'React Native Paper', 'Restyle', 'Shopify Restyle'] },
    { name: 'RN Backend', skills: ['Firebase RN', 'Supabase RN', 'GraphQL RN', 'AsyncStorage', 'SQLite RN'] },
    { name: 'RN Testing', skills: ['React Native Testing Library', 'Detox', 'Jest RN', 'Maestro', 'Appium'] },
  ],
  'cross-platform-dev': [
    { name: '.NET MAUI', skills: ['C# MAUI', 'XAML', 'MVVM MAUI', 'Shell Navigation', 'MAUI Graphics'] },
    { name: 'Xamarin', skills: ['Xamarin Forms', 'Xamarin Native', 'iOS Xamarin', 'Android Xamarin', 'Prism'] },
    { name: 'Electron', skills: ['Electron.js', 'IPC Main/Process', 'Electron Security', 'Auto Updates', 'Electron Builder'] },
    { name: 'Tauri', skills: ['Tauri Rust', 'Tauri Commands', 'Tauri Security', 'Tauri Plugins', 'Tauri Bundler'] },
    { name: 'Progressive Web Apps', skills: ['Service Workers', 'Web App Manifest', 'Offline First', 'Push Web', 'PWA Caching'] },
  ],
  'web-development': [
    { name: 'Static Sites', skills: ['HTML/CSS', 'JavaScript Vanilla', 'Static Generators', 'Hugo', 'Jekyll'] },
    { name: 'Web Performance', skills: ['Lighthouse', 'Core Web Vitals', 'Image Optimization', 'Code Splitting', 'CDN Configuration'] },
    { name: 'Web Security', skills: ['HTTPS/SSL', 'CSP Headers', 'XSS Prevention', 'CSRF Protection', 'OAuth Integration'] },
    { name: 'Web Hosting', skills: ['Vercel Deploy', 'Netlify Deploy', 'AWS S3/CloudFront', 'Firebase Hosting', 'cPanel'] },
    { name: 'Web Accessibility', skills: ['WCAG 2.2', 'ARIA Attributes', 'Screen Reader', 'Keyboard Navigation', 'Color Contrast'] },
  ],
  'web-design': [
    { name: 'Website Design', skills: ['Landing Pages', 'Corporate Websites', 'E-commerce Design', 'Portfolio Sites', 'Blog Design'] },
    { name: 'Wireframing', skills: ['Figma Wireframes', 'Balsamiq', 'Sketch Wireframes', 'Adobe XD', 'Low-Fi Prototypes'] },
    { name: 'UI Prototyping', skills: ['Figma Prototypes', 'Interactive Mockups', 'Clickable Protos', 'InVision', 'Principle'] },
    { name: 'Design Systems', skills: ['Component Libraries', 'Style Guides', 'Design Tokens', 'Figma Components', 'Storybook'] },
    { name: 'Responsive Design', skills: ['Mobile-First CSS', 'Breakpoint Planning', 'Fluid Layouts', 'Media Queries', 'Cross-Browser'] },
  ],
  'react-development': [
    { name: 'React Core', skills: ['Hooks API', 'Context API', 'React Router', 'Suspense', 'React Server Components'] },
    { name: 'React State', skills: ['Redux Toolkit', 'Zustand', 'Jotai', 'Recoil', 'React Query'] },
    { name: 'React Performance', skills: ['Code Splitting', 'React.memo', 'useMemo/useCallback', 'Virtual List', 'Lazy Loading'] },
    { name: 'React Ecosystem', skills: ['Next.js', 'Gatsby', 'Remix', 'Vite React', 'CRA'] },
    { name: 'React Testing', skills: ['React Testing Library', 'Cypress React', 'Storybook Tests', 'Playwright React', 'MSW'] },
  ],
  'vuejs-development': [
    { name: 'Vue Core', skills: ['Composition API', 'Vue Router', 'Pinia', 'Vuex', 'Script Setup'] },
    { name: 'Vue Ecosystem', skills: ['Nuxt 3', 'Vite Vue', 'Vuetify', 'PrimeVue', 'Quasar Vue'] },
    { name: 'Vue UI', skills: ['Tailwind Vue', 'SCSS Vue', 'Vue Transitions', 'Form Validation', 'Vue i18n'] },
    { name: 'Vue Testing', skills: ['Vue Test Utils', 'Vitest Vue', 'Cypress Vue', 'Playwright Vue', 'Testing Library Vue'] },
    { name: 'Vue Advanced', skills: ['Custom Directives', 'Render Functions', 'Provide/Inject', 'Teleport Vue', 'Suspense Vue'] },
  ],
  'java-development': [
    { name: 'Java Core', skills: ['Java 21+', 'Streams API', 'Concurrency', 'Records/Sealed', 'JVM Optimization'] },
    { name: 'Spring Ecosystem', skills: ['Spring Boot 3', 'Spring Data JPA', 'Spring Security', 'Spring Cloud', 'Spring WebFlux'] },
    { name: 'Java Testing', skills: ['JUnit 5', 'Mockito', 'Integration Tests', 'TestContainers', 'ArchUnit'] },
    { name: 'Java Build Tools', skills: ['Maven', 'Gradle', 'Multi-module', 'Dependency Management', 'Build Automation'] },
    { name: 'Java Enterprise', skills: ['Jakarta EE', 'MicroProfile', 'WildFly', 'Oracle DB', 'JMS'] },
  ],
  'python-development': [
    { name: 'Python Core', skills: ['Python 3.12+', 'Async/Await', 'Type Hints', 'Decorators', 'Generators'] },
    { name: 'Web Frameworks', skills: ['Django', 'FastAPI', 'Flask', 'Sanic', 'Tornado'] },
    { name: 'Python Data', skills: ['Pandas', 'NumPy', 'Matplotlib', 'SciPy', 'Jupyter'] },
    { name: 'Python Testing', skills: ['pytest', 'unittest', 'Mock', 'Hypothesis', 'Tox'] },
    { name: 'Python DevOps', skills: ['Poetry', 'Docker Python', 'Celery', 'Redis Python', 'SQLAlchemy'] },
  ],
  'sql-development': [
    { name: 'SQL Querying', skills: ['SELECT Queries', 'Joins', 'Subqueries', 'Window Functions', 'CTEs'] },
    { name: 'SQL Optimization', skills: ['Query Plans', 'Index Tuning', 'Partitioning', 'Query Caching', 'Materialized Views'] },
    { name: 'SQL Databases', skills: ['PostgreSQL', 'MySQL', 'SQL Server', 'SQLite', 'Oracle SQL'] },
    { name: 'Database Design', skills: ['Normalization', 'ER Diagrams', 'Schema Design', 'Constraints', 'Triggers'] },
    { name: 'Advanced SQL', skills: ['Stored Procedures', 'PL/pgSQL', 'Functions', 'JSON/JSONB', 'Full-Text Search'] },
  ],
  'api-development': [
    { name: 'REST APIs', skills: ['RESTful Design', 'OpenAPI/Swagger', 'Versioning', 'HATEOAS', 'Rate Limiting'] },
    { name: 'GraphQL', skills: ['Apollo Server', 'GraphQL Schema', 'Resolvers', 'Subscriptions', 'Federation'] },
    { name: 'API Security', skills: ['JWT Auth', 'OAuth 2.0', 'API Keys', 'SSL/TLS', 'Input Validation'] },
    { name: 'API Documentation', skills: ['Swagger UI', 'Postman Collections', 'ReadMe', 'Redoc', 'API Blueprint'] },
    { name: 'API Testing', skills: ['Postman Tests', 'Newman', 'Jest API', 'Supertest', 'Load Testing APIs'] },
  ],
  'software-development': [
    { name: 'Desktop Apps', skills: ['Electron Desktop', 'Tauri Desktop', 'WPF/.NET', 'Qt/C++', 'Java Swing'] },
    { name: 'Microservices', skills: ['Docker', 'Kubernetes', 'Service Mesh', 'Event-Driven', 'CQRS'] },
    { name: 'Design Patterns', skills: ['SOLID Principles', 'Gang of Four', 'Repository Pattern', 'Factory Pattern', 'Observer Pattern'] },
    { name: 'Version Control', skills: ['Git Advanced', 'GitHub Flow', 'GitLab CI', 'Monorepo', 'Git Hooks'] },
    { name: 'Code Quality', skills: ['Code Review', 'Static Analysis', 'SonarQube', 'ESLint/Prettier', 'Tech Debt Management'] },
  ],
  'software-architecture': [
    { name: 'Architecture Patterns', skills: ['Microservices', 'Event-Driven', 'Layered Architecture', 'Hexagonal Architecture', 'Clean Architecture'] },
    { name: 'System Design', skills: ['Scalability', 'High Availability', 'Disaster Recovery', 'Capacity Planning', 'Load Balancing'] },
    { name: 'Architecture Documentation', skills: ['C4 Model', 'UML Diagrams', 'ADR Logs', 'Architecture Reviews', 'Tech Radar'] },
    { name: 'Performance Architecture', skills: ['Caching Strategies', 'Database Sharding', 'CDN Strategy', 'Async Processing', 'Connection Pooling'] },
    { name: 'Cloud Architecture', skills: ['AWS Well-Architected', 'Azure CAF', 'GCP Architecture', 'Multi-Cloud', 'Hybrid Cloud'] },
  ],
  'devops-engineering': [
    { name: 'CI/CD', skills: ['GitHub Actions', 'GitLab CI/CD', 'Jenkins', 'CircleCI', 'ArgoCD'] },
    { name: 'Containerization', skills: ['Docker', 'Kubernetes', 'Helm Charts', 'Docker Compose', 'Podman'] },
    { name: 'Infrastructure as Code', skills: ['Terraform', 'Pulumi', 'Ansible', 'CloudFormation', 'CDK'] },
    { name: 'Monitoring', skills: ['Prometheus', 'Grafana', 'Datadog', 'New Relic', 'ELK Stack'] },
    { name: 'GitOps', skills: ['ArgoCD GitOps', 'Flux CD', 'GitHub/GitLab CI', 'Kustomize', 'SRE Principles'] },
  ],
  'cloud-computing': [
    { name: 'AWS Services', skills: ['EC2', 'Lambda', 'S3', 'RDS', 'ECS/EKS'] },
    { name: 'Azure Services', skills: ['Azure Functions', 'AKS', 'Azure SQL', 'Blob Storage', 'Azure DevOps'] },
    { name: 'GCP Services', skills: ['Cloud Run', 'GKE', 'BigQuery', 'Cloud Storage', 'Cloud Functions'] },
    { name: 'Cloud Migration', skills: ['Lift and Shift', 'Re-platforming', 'Cloud Native', 'Hybrid Cloud', 'Multi-Cloud Strategy'] },
    { name: 'Cloud Security', skills: ['IAM Policies', 'Security Groups', 'Encryption at Rest', 'Secrets Management', 'Cloud Compliance'] },
  ],
  'cybersecurity': [
    { name: 'Penetration Testing', skills: ['Network Pentest', 'Web App Pentest', 'Mobile Pentest', 'Cloud Pentest', 'Social Engineering'] },
    { name: 'Vulnerability Assessment', skills: ['Nessus', 'OpenVAS', 'Qualys', 'NMAP', 'Burp Suite'] },
    { name: 'Security Operations', skills: ['SIEM', 'SOC', 'Incident Response', 'Threat Hunting', 'Forensics'] },
    { name: 'Application Security', skills: ['SAST', 'DAST', 'SCA', 'Secure Code Review', 'OWASP Top 10'] },
    { name: 'Compliance Security', skills: ['ISO 27001', 'SOC 2', 'PCI DSS', 'HIPAA', 'GDPR'] },
  ],
  'network-administration': [
    { name: 'Network Setup', skills: ['Router Config', 'Switch Config', 'VLAN Setup', 'Firewall Config', 'VPN Setup'] },
    { name: 'Network Monitoring', skills: ['PRTG', 'Zabbix', 'Nagios', 'SolarWinds', 'Wireshark'] },
    { name: 'Network Security', skills: ['Firewall Rules', 'IDS/IPS', 'Network Segmentation', 'Access Control', 'Security Policies'] },
    { name: 'Wireless Networks', skills: ['WiFi Design', 'Access Points', 'Site Survey', 'Wireless Security', 'Mesh Networks'] },
    { name: 'Network Protocols', skills: ['TCP/IP', 'DNS/DHCP', 'BGP/OSPF', 'MPLS', 'SD-WAN'] },
  ],
  'database-administration': [
    { name: 'DB Management', skills: ['PostgreSQL Admin', 'MySQL Admin', 'Oracle Admin', 'MongoDB Admin', 'Redis Admin'] },
    { name: 'DB Optimization', skills: ['Query Tuning', 'Index Strategy', 'Partitioning', 'Vacuum/Analyze', 'Connection Pooling'] },
    { name: 'Backup & Recovery', skills: ['Automated Backups', 'Point-in-Time Recovery', 'Replication', 'Failover', 'Disaster Recovery'] },
    { name: 'DB Monitoring', skills: ['Performance Monitor', 'Slow Query Log', 'pg_stat_statements', 'Auto Scaling', 'Alerting'] },
    { name: 'DB Security', skills: ['Access Control', 'Encryption', 'Audit Logging', 'Row Level Security', 'Data Masking'] },
  ],
  'it-consulting': [
    { name: 'IT Strategy', skills: ['Digital Transformation', 'IT Roadmap', 'Technology Audit', 'Vendor Selection', 'IT Budget Planning'] },
    { name: 'Infrastructure', skills: ['Server Infrastructure', 'Storage Solutions', 'Network Design', 'Disaster Recovery', 'Data Center'] },
    { name: 'IT Compliance', skills: ['IT Audits', 'SOX Compliance', 'ISO Standards', 'IT Governance', 'Risk Assessment'] },
    { name: 'Technology Advisory', skills: ['Tech Stack Selection', 'Cloud Strategy', 'Digital Innovation', 'IT Architecture', 'Emerging Tech'] },
    { name: 'IT Operations', skills: ['ITIL Framework', 'Service Desk', 'SLA Management', 'IT Asset Management', 'Change Management'] },
  ],
  'technical-support': [
    { name: 'Help Desk', skills: ['Ticketing Systems', 'Remote Support', 'Password Reset', 'Account Setup', 'Troubleshooting'] },
    { name: 'Software Support', skills: ['Application Support', 'SaaS Support', 'Bug Reporting', 'Feature Requests', 'Release Testing'] },
    { name: 'Hardware Support', skills: ['Desktop Support', 'Printer Setup', 'Peripherals', 'Hardware Diagnostics', 'Asset Tracking'] },
    { name: 'Customer Support Tech', skills: ['Zendesk', 'Freshdesk', 'Intercom', 'Jira Service', 'Confluence'] },
    { name: 'SLA Management', skills: ['Response Times', 'Escalation Matrix', 'Priority Levels', 'Resolution SLAs', 'SLA Reporting'] },
  ],
  'blockchain-development': [
    { name: 'Smart Contracts', skills: ['Solidity', 'Rust (Solana)', 'Hardhat', 'Foundry', 'Remix IDE'] },
    { name: 'DApp Development', skills: ['ethers.js', 'web3.js', 'wagmi', 'RainbowKit', 'Thirdweb'] },
    { name: 'DeFi', skills: ['Uniswap V3', 'Aave', 'Compound', 'Yield Farming', 'Liquidity Pools'] },
    { name: 'NFTs', skills: ['ERC-721', 'ERC-1155', 'IPFS/Arweave', 'Mint Sites', 'Marketplace'] },
    { name: 'Blockchain Platforms', skills: ['Ethereum', 'Solana', 'Polygon', 'Avalanche', 'Base'] },
  ],
  'erp-development': [
    { name: 'SAP', skills: ['ABAP', 'SAP Fiori', 'SAP HANA', 'SAP MM/SD', 'SAP FI/CO'] },
    { name: 'Odoo', skills: ['Odoo Dev', 'Odoo Modules', 'Odoo Customization', 'Odoo Accounting', 'Odoo CRM'] },
    { name: 'Oracle ERP', skills: ['Oracle EBS', 'Oracle Cloud ERP', 'Oracle SCM', 'Oracle HCM', 'Oracle Financials'] },
    { name: 'Microsoft Dynamics', skills: ['D365 Finance', 'D365 Supply Chain', 'D365 Sales', 'Power Platform', 'X++'] },
    { name: 'ERP Integration', skills: ['API Integration', 'EDI', 'Data Migration ERP', 'ERP Consulting', 'ERP Support'] },
  ],
  'no-code-development': [
    { name: 'Bubble', skills: ['Bubble Workflows', 'Bubble Plugins', 'Bubble API', 'Bubble Database', 'Bubble Responsive'] },
    { name: 'Airtable', skills: ['Airtable Bases', 'Interface Designer', 'Airtable Automation', 'Scripting Block', 'Sync Tables'] },
    { name: 'Zapier', skills: ['Zapier Workflows', 'Multi-Step Zaps', 'Webhooks Zapier', 'Filters/Paths', 'Zapier Integrations'] },
    { name: 'Make (Integromat)', skills: ['Make Scenarios', 'Make Modules', 'Data Transformation', 'Make Routers', 'Make Webhooks'] },
    { name: 'Low-Code Platforms', skills: ['Retool', 'Appsmith', 'Tooljet', 'FlutterFlow', 'OutSystems'] },
  ],
};

/**
 * Now generate subcategories and skills for remaining categories not in the map above.
 * Each gets generic but relevant subcategories.
 */
const GENERIC_SUBCATEGORIES = [
  { name: 'General Services', skills: ['Consultation', 'Strategy Planning', 'Implementation', 'Management', 'Support'] },
  { name: 'Specialized Services', skills: ['Advanced Analytics', 'Custom Development', 'Integration', 'Optimization', 'Automation'] },
  { name: 'Consulting', skills: ['Needs Assessment', 'Solution Design', 'Roadmap Planning', 'Vendor Selection', 'ROI Analysis'] },
  { name: 'Management & Support', skills: ['Ongoing Management', 'Technical Support', 'Performance Monitoring', 'Reporting', 'Training'] },
  { name: 'Quality Assurance', skills: ['Testing', 'Review', 'Compliance Check', 'Optimization', 'Documentation'] },
];

// Additional categories that need custom subcategories based on their domain
const ADDITIONAL_SUBCATEGORIES = {
  'webflow-development': [
    { name: 'Webflow Design', skills: ['Webflow Designer', 'CMS Collections', 'Interactions/Animations', 'Responsive Webflow', 'Custom Code'] },
    { name: 'Webflow CMS', skills: ['Blog CMS', 'Dynamic Content', 'Collection Templates', 'CMS API', 'SEO Webflow'] },
  ],
  'shopify-development': [
    { name: 'Shopify Themes', skills: ['Liquid Templates', 'Theme Customization', 'Shopify 2.0', 'Section/Blocks', 'Mobile Responsive'] },
    { name: 'Shopify Apps', skills: ['App Integration', 'Custom Apps', 'Shopify API', 'Webhooks Shopify', 'Checkout Customization'] },
  ],
  'wordpress-development': [
    { name: 'WordPress Themes', skills: ['Theme Development', 'Block Themes', 'FSE Themes', 'Theme Customization', 'Child Themes'] },
    { name: 'WordPress Plugins', skills: ['Plugin Development', 'WooCommerce', 'Custom Post Types', 'REST API WP', 'Shortcodes'] },
  ],
  'game-development': [
    { name: 'Unity Development', skills: ['Unity 2D', 'Unity 3D', 'C# Scripting', 'Unity Physics', 'Unity UI'] },
    { name: 'Unreal Engine', skills: ['Blueprints', 'C++ UE', 'UE5 Features', 'Nanite/Lumen', 'UE Animations'] },
  ],
  'graphic-design': [
    { name: 'Print Design', skills: ['Business Cards', 'Brochures', 'Flyers', 'Brand Collateral', 'Packaging Design'] },
    { name: 'Digital Graphics', skills: ['Social Media Graphics', 'Banner Ads', 'Email Templates', 'Infographics', 'E-books'] },
  ],
  'video-editing': [
    { name: 'Post-Production', skills: ['Adobe Premiere', 'DaVinci Resolve', 'Final Cut Pro', 'Color Grading', 'Audio Mixing'] },
    { name: 'Effects & Compositing', skills: ['After Effects', 'Motion Graphics', 'Green Screen', 'Visual Effects', 'Title Animation'] },
  ],
  'seo': [
    { name: 'On-Page SEO', skills: ['Keyword Research', 'Meta Tags', 'Content Optimization', 'Header Structure', 'Internal Linking'] },
    { name: 'Off-Page SEO', skills: ['Link Building', 'Guest Posting', 'Digital PR', 'Brand Mentions', 'Outreach'] },
  ],
  'social-media-marketing': [
    { name: 'Content Creation', skills: ['Reels/Shorts', 'Carousel Posts', 'Story Design', 'Video Content', 'Copywriting'] },
    { name: 'Ad Campaigns', skills: ['Facebook Ads', 'Instagram Ads', 'LinkedIn Ads', 'TikTok Ads', 'Twitter Ads'] },
  ],
  'lead-generation': [
    { name: 'B2B Lead Gen', skills: ['LinkedIn Outreach', 'Email Prospecting', 'Cold Email', 'Account Based Marketing', 'Lead Scoring'] },
    { name: 'B2C Lead Gen', skills: ['Social Media Leads', 'Content Lead Gen', 'Webinar Leads', 'Referral Programs', 'Lead Magnets'] },
  ],
  'customer-support': [
    { name: 'Phone Support', skills: ['Inbound Calls', 'Outbound Calls', 'Customer Service', 'Complaint Handling', 'Call Scripting'] },
    { name: 'Live Chat Support', skills: ['Chat Systems', 'Real-time Support', 'Multi-language Chat', 'Chatbots', 'Response Templates'] },
  ],
  'virtual-assistance': [
    { name: 'Admin Support', skills: ['Calendar Management', 'Email Management', 'Data Entry', 'Travel Booking', 'Document Prep'] },
    { name: 'Executive Support', skills: ['Meeting Coordination', 'Expense Reports', 'Presentation Prep', 'Client Communication', 'Project Tracking'] },
  ],
};

// Generate all SQL
function generateSQL() {
  const lines = [];
  lines.push('-- ============================================================');
  lines.push('-- SUBCATEGORIES AND SKILLS SEED');
  lines.push('-- Generated by scripts/seed-categories.js');
  lines.push('-- ============================================================\n');

  // Use a DO block for procedural insertion
  lines.push('DO $$');
  lines.push('DECLARE');
  lines.push('  cat_id uuid;');
  lines.push('  sub_id uuid;');
  lines.push('');
  lines.push('BEGIN');
  lines.push('');

  // Process all categories from SUBCATEGORY_MAP, ADDITIONAL_SUBCATEGORIES, and GENERIC ones
  const processedCategories = new Set();
  
  for (const [slug, subcategories] of Object.entries(SUBCATEGORY_MAP)) {
    processedCategories.add(slug);
    
    for (const sub of subcategories) {
      lines.push(`  -- ${slug} → ${sub.name}`);
      lines.push(`  SELECT id INTO cat_id FROM categories WHERE slug = '${slug}';`);
      
      // Escape single quotes in names
      const subName = sub.name.replace(/'/g, "''");
      lines.push(`  INSERT INTO subcategories (category_id, name, slug, description, is_active)`);
      lines.push(`  VALUES (cat_id, '${subName}', lower(regexp_replace('${subName}', '[^a-zA-Z0-9]+', '-', 'g')), '${subName} services', true)`);
      lines.push(`  RETURNING id INTO sub_id;`);
      
      for (const skill of sub.skills) {
        const skillName = skill.replace(/'/g, "''");
        const skillSlug = skill.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        lines.push(`  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, '${skillName}', '${skillSlug}');`);
      }
      lines.push('');
    }
  }

  // Process ADDITIONAL_SUBCATEGORIES
  for (const [slug, subcategories] of Object.entries(ADDITIONAL_SUBCATEGORIES)) {
    if (processedCategories.has(slug)) continue;
    processedCategories.add(slug);
    
    for (const sub of subcategories) {
      lines.push(`  -- ${slug} → ${sub.name}`);
      lines.push(`  SELECT id INTO cat_id FROM categories WHERE slug = '${slug}';`);
      
      const subName = sub.name.replace(/'/g, "''");
      lines.push(`  INSERT INTO subcategories (category_id, name, slug, description, is_active)`);
      lines.push(`  VALUES (cat_id, '${subName}', lower(regexp_replace('${subName}', '[^a-zA-Z0-9]+', '-', 'g')), '${subName} services', true)`);
      lines.push(`  RETURNING id INTO sub_id;`);
      
      for (const skill of sub.skills) {
        const skillName = skill.replace(/'/g, "''");
        const skillSlug = skill.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        lines.push(`  INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, '${skillName}', '${skillSlug}');`);
      }
      lines.push('');
    }
  }

  // Get all category slugs from categories table not yet processed
  lines.push('  -- Remaining categories get generic subcategories');
  lines.push('  FOR cat_id IN SELECT id FROM categories WHERE slug NOT IN (');
  const processedSlugs = [...processedCategories].map(s => `'${s}'`).join(', ');
  lines.push(`    ${processedSlugs}`);
  lines.push('  )');
  lines.push('  LOOP');
  
  for (const sub of GENERIC_SUBCATEGORIES) {
    const subName = sub.name.replace(/'/g, "''");
    lines.push(`    INSERT INTO subcategories (category_id, name, slug, description, is_active)`);
    lines.push(`    VALUES (cat_id, '${subName}', lower(regexp_replace('${subName}', '[^a-zA-Z0-9]+', '-', 'g')), '${subName} services', true)`);
    lines.push(`    RETURNING id INTO sub_id;`);
    
    for (const skill of sub.skills) {
      const skillName = skill.replace(/'/g, "''");
      const skillSlug = skill.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      lines.push(`    INSERT INTO skills (subcategory_id, name, slug) VALUES (sub_id, '${skillName}', '${skillSlug}');`);
    }
    lines.push('');
  }
  lines.push('  END LOOP;');

  lines.push('END $$;');
  lines.push('');

  return lines.join('\n');
}

const sql = generateSQL();
console.log(sql);
