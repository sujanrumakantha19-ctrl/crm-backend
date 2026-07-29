const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: 'CRM API',
    description: 'Real Estate CRM Backend API — manages projects, plots, leads, tasks, attendance, channel partners, groups, activity logs, notifications, and user authentication.',
    version: '1.0.0',
    contact: { name: 'CRM Support' },
  },
  servers: [
    { url: 'http://localhost:5000', description: 'Development server' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas: {
      User: {
        type: 'object',
        properties: {
          _id: { type: 'string', example: '665f1a2b3c4d5e6f7a8b9c0d' },
          name: { type: 'string', example: 'Priya Sharma' },
          initials: { type: 'string', example: 'PS', maxLength: 2 },
          role: { type: 'string', enum: ['admin', 'staff', 'partner'] },
          designation: { type: 'string', example: 'Sales Executive' },
          email: { type: 'string', format: 'email', example: 'priya@crm.com' },
          phone: { type: 'string', example: '+91 98765 43211' },
          avatarBg: { type: 'string', example: 'bg-blue-500' },
          groupId: { type: 'string', nullable: true },
          dob: { type: 'string', format: 'date', nullable: true },
          isActive: { type: 'boolean', default: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      UserInput: {
        type: 'object',
        required: ['name', 'initials', 'role', 'email', 'phone', 'password'],
        properties: {
          name: { type: 'string', example: 'Priya Sharma' },
          initials: { type: 'string', example: 'PS', maxLength: 2 },
          role: { type: 'string', enum: ['admin', 'staff', 'partner'] },
          designation: { type: 'string' },
          email: { type: 'string', format: 'email' },
          phone: { type: 'string' },
          avatarBg: { type: 'string' },
          groupId: { type: 'string' },
          dob: { type: 'string', format: 'date' },
          isActive: { type: 'boolean' },
          password: { type: 'string', minLength: 6 },
        },
      },
      Project: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          name: { type: 'string', example: 'Green Valley Enclave' },
          location: { type: 'string', example: 'Hyderabad' },
          description: { type: 'string' },
          status: { type: 'string', enum: ['Planning', 'Active', 'Completed', 'On Hold'] },
          totalLandArea: { type: 'number', example: 25 },
          landAreaUnit: { type: 'string', default: 'Acres' },
          surveyNumber: { type: 'string' },
          village: { type: 'string' },
          mandal: { type: 'string' },
          district: { type: 'string' },
          landType: { type: 'string', enum: ['Agricultural', 'Residential', 'Commercial', 'Mixed'] },
          totalPlots: { type: 'number', example: 48 },
          plotSize: { type: 'number', example: 200 },
          plotSizeUnit: { type: 'string', default: 'Sq Yards' },
          roadFacingPlots: { type: 'number' },
          cornerPlots: { type: 'number' },
          pricePerSqUnit: { type: 'number', example: 4500 },
          images: { type: 'array', items: { type: 'string' } },
          plotImages: { type: 'array', items: { type: 'string' } },
          latitude: { type: 'string' },
          longitude: { type: 'string' },
          category: { type: 'string', enum: ['Open Plots', 'Villas', 'Apartments', 'Commercial', 'Farm Land'] },
          isEnabled: { type: 'boolean', default: true },
          owner: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              phone: { type: 'string' },
              email: { type: 'string' },
              address: { type: 'string' },
              kycDocuments: { type: 'array', items: { type: 'object' } },
            },
          },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      ProjectInput: {
        type: 'object',
        required: ['name', 'location', 'totalLandArea', 'totalPlots'],
        properties: {
          name: { type: 'string' },
          location: { type: 'string' },
          description: { type: 'string' },
          status: { type: 'string', enum: ['Planning', 'Active', 'Completed', 'On Hold'] },
          totalLandArea: { type: 'number' },
          landAreaUnit: { type: 'string' },
          surveyNumber: { type: 'string' },
          village: { type: 'string' },
          mandal: { type: 'string' },
          district: { type: 'string' },
          landType: { type: 'string', enum: ['Agricultural', 'Residential', 'Commercial', 'Mixed'] },
          totalPlots: { type: 'number' },
          plotSize: { type: 'number' },
          plotSizeUnit: { type: 'string' },
          roadFacingPlots: { type: 'number' },
          cornerPlots: { type: 'number' },
          pricePerSqUnit: { type: 'number' },
          images: { type: 'array', items: { type: 'string' } },
          latitude: { type: 'string' },
          longitude: { type: 'string' },
          category: { type: 'string', enum: ['Open Plots', 'Villas', 'Apartments', 'Commercial', 'Farm Land'] },
          isEnabled: { type: 'boolean' },
          owner: { type: 'object' },
        },
      },
      Plot: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          projectId: { type: 'string' },
          plotNumber: { type: 'number', example: 1 },
          status: { type: 'string', enum: ['Available', 'Booked', 'Reserved', 'Canceled'] },
          facing: { type: 'string', example: 'North' },
          size: { type: 'number', example: 200 },
          sizeUnit: { type: 'string', default: 'Sq Yards' },
          type: { type: 'string', enum: ['Residential', 'Commercial'] },
          price: { type: 'number' },
          timeline: { type: 'array', items: { type: 'object' } },
          pendingApproval: { type: 'object', nullable: true },
        },
      },
      PlotInput: {
        type: 'object',
        required: ['projectId', 'plotNumber'],
        properties: {
          projectId: { type: 'string' },
          plotNumber: { type: 'number' },
          status: { type: 'string', enum: ['Available', 'Booked', 'Reserved', 'Canceled'] },
          facing: { type: 'string' },
          size: { type: 'number' },
          sizeUnit: { type: 'string' },
          type: { type: 'string', enum: ['Residential', 'Commercial'] },
          price: { type: 'number' },
        },
      },
      Lead: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          customerName: { type: 'string', example: 'Suresh Patel' },
          phone: { type: 'string', example: '+91 98765 11111' },
          email: { type: 'string', format: 'email' },
          city: { type: 'string', example: 'Hyderabad' },
          budgetMin: { type: 'number' },
          budgetMax: { type: 'number' },
          propertyInterest: { type: 'string' },
          notes: { type: 'string' },
          source: { type: 'string' },
          sourceType: { type: 'string', enum: ['Channel Partner', 'Staff', 'Direct'] },
          assignedTo: { type: 'string', nullable: true },
          assignedToName: { type: 'string', nullable: true },
          status: { type: 'string', enum: ['Open', 'Qualified', 'Unqualified', 'Customer'] },
          dateAdded: { type: 'string' },
          projectId: { type: 'string', nullable: true },
          plotId: { type: 'string', nullable: true },
          paymentStatus: { type: 'string', enum: ['Not Paid', 'Partially Paid', 'Fully Paid'] },
          followUps: { type: 'array', items: { type: 'object' } },
        },
      },
      LeadInput: {
        type: 'object',
        required: ['customerName', 'phone', 'email'],
        properties: {
          customerName: { type: 'string' },
          phone: { type: 'string' },
          email: { type: 'string', format: 'email' },
          city: { type: 'string' },
          budgetMin: { type: 'number' },
          budgetMax: { type: 'number' },
          propertyInterest: { type: 'string' },
          notes: { type: 'string' },
          source: { type: 'string' },
          sourceType: { type: 'string', enum: ['Channel Partner', 'Staff', 'Direct'] },
          assignedTo: { type: 'string' },
          status: { type: 'string', enum: ['Open', 'Qualified', 'Unqualified', 'Customer'] },
          projectId: { type: 'string' },
          plotId: { type: 'string' },
          paymentStatus: { type: 'string', enum: ['Not Paid', 'Partially Paid', 'Fully Paid'] },
        },
      },
      Task: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          title: { type: 'string', example: 'Call Suresh Patel' },
          description: { type: 'string' },
          status: { type: 'string', enum: ['To Do', 'In Progress', 'In Review', 'Done'] },
          priority: { type: 'string', enum: ['Low', 'Medium', 'High'] },
          assignee: { type: 'string', nullable: true },
          assigneeInitials: { type: 'string' },
          dueDate: { type: 'string' },
          dueTime: { type: 'string' },
          project: { type: 'string' },
          comments: { type: 'array', items: { type: 'object' } },
          createdAt: { type: 'string' },
        },
      },
      TaskInput: {
        type: 'object',
        required: ['title'],
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          status: { type: 'string', enum: ['To Do', 'In Progress', 'In Review', 'Done'] },
          priority: { type: 'string', enum: ['Low', 'Medium', 'High'] },
          assignee: { type: 'string' },
          assigneeInitials: { type: 'string' },
          dueDate: { type: 'string' },
          dueTime: { type: 'string' },
          project: { type: 'string' },
        },
      },
      Attendance: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          staffId: { type: 'string' },
          staffName: { type: 'string', example: 'Priya Sharma' },
          date: { type: 'string', example: '2025-06-03' },
          checkIn: { type: 'string', example: '09:02 AM' },
          checkOut: { type: 'string', example: '06:15 PM' },
          duration: { type: 'string', example: '9h 13m' },
          status: { type: 'string', enum: ['Present', 'Absent', 'Half Day'] },
          role: { type: 'string' },
        },
      },
      AttendanceInput: {
        type: 'object',
        required: ['staffId', 'staffName', 'date', 'status'],
        properties: {
          staffId: { type: 'string' },
          staffName: { type: 'string' },
          date: { type: 'string' },
          checkIn: { type: 'string' },
          checkOut: { type: 'string' },
          duration: { type: 'string' },
          status: { type: 'string', enum: ['Present', 'Absent', 'Half Day'] },
          role: { type: 'string' },
        },
      },
      ChannelPartner: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          name: { type: 'string', example: 'Srinivas Associates' },
          companyName: { type: 'string' },
          phone: { type: 'string' },
          email: { type: 'string', format: 'email' },
          city: { type: 'string' },
          reraId: { type: 'string' },
          totalLeads: { type: 'number' },
          isActive: { type: 'boolean' },
          initials: { type: 'string' },
          avatarBg: { type: 'string' },
          notes: { type: 'string' },
        },
      },
      ChannelPartnerInput: {
        type: 'object',
        required: ['name', 'phone', 'email'],
        properties: {
          name: { type: 'string' },
          companyName: { type: 'string' },
          phone: { type: 'string' },
          email: { type: 'string', format: 'email' },
          city: { type: 'string' },
          reraId: { type: 'string' },
          totalLeads: { type: 'number' },
          isActive: { type: 'boolean' },
          initials: { type: 'string' },
          avatarBg: { type: 'string' },
          notes: { type: 'string' },
        },
      },
      Notification: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          type: { type: 'string', enum: ['birthday', 'lead_status', 'new_lead', 'task_assigned', 'attendance', 'booking'] },
          message: { type: 'string' },
          timeAgo: { type: 'string' },
          isRead: { type: 'boolean' },
          isToday: { type: 'boolean' },
          actorName: { type: 'string', nullable: true },
        },
      },
      NotificationInput: {
        type: 'object',
        required: ['type', 'message'],
        properties: {
          type: { type: 'string', enum: ['birthday', 'lead_status', 'new_lead', 'task_assigned', 'attendance', 'booking'] },
          message: { type: 'string' },
          timeAgo: { type: 'string' },
          isRead: { type: 'boolean' },
          isToday: { type: 'boolean' },
          actorName: { type: 'string' },
        },
      },
      Group: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          name: { type: 'string', example: 'Sales Team A' },
          description: { type: 'string', example: 'Hyderabad region sales' },
          members: { type: 'array', items: { type: 'string' } },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      GroupInput: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          members: { type: 'array', items: { type: 'string' } },
        },
      },
      ActivityLog: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          actorId: { type: 'string' },
          actorName: { type: 'string', example: 'Ravi Kumar' },
          actorRole: { type: 'string', example: 'Staff' },
          actorInitials: { type: 'string' },
          actorAvatarBg: { type: 'string' },
          action: { type: 'string', example: 'Created new lead #1051' },
          actionType: { type: 'string', enum: ['Created', 'Updated', 'Deleted', 'Status Change'] },
          entityType: { type: 'string', example: 'Lead' },
          entityId: { type: 'string' },
          entityName: { type: 'string' },
          timestamp: { type: 'string' },
          ipAddress: { type: 'string' },
        },
      },
      ActivityLogInput: {
        type: 'object',
        required: ['actorId', 'actorName', 'actorRole', 'action', 'actionType', 'entityType', 'entityId', 'entityName', 'timestamp'],
        properties: {
          actorId: { type: 'string' },
          actorName: { type: 'string' },
          actorRole: { type: 'string' },
          actorInitials: { type: 'string' },
          actorAvatarBg: { type: 'string' },
          action: { type: 'string' },
          actionType: { type: 'string', enum: ['Created', 'Updated', 'Deleted', 'Status Change'] },
          entityType: { type: 'string' },
          entityId: { type: 'string' },
          entityName: { type: 'string' },
          timestamp: { type: 'string' },
          ipAddress: { type: 'string' },
        },
      },
      Success: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: {},
        },
      },
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: { type: 'string' },
        },
      },
      Pagination: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          count: { type: 'number' },
          pagination: {
            type: 'object',
            properties: {
              next: { type: 'object', properties: { page: { type: 'number' }, limit: { type: 'number' } } },
              prev: { type: 'object', properties: { page: { type: 'number' }, limit: { type: 'number' } } },
            },
          },
          data: { type: 'array', items: {} },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    // ─── Health ──────────────────────────────────────
    '/api/v1/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check',
        description: 'Returns server status, uptime, and timestamp.',
        security: [],
        responses: {
          200: {
            description: 'Server is healthy',
            content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'object', properties: { status: { type: 'string' }, uptime: { type: 'number' }, timestamp: { type: 'string' } } } } } } },
          },
        },
      },
    },

    // ─── Auth ────────────────────────────────────────
    '/api/v1/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register a new user',
        security: [],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/UserInput' } } } },
        responses: { 201: { description: 'User registered', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, token: { type: 'string' } } } } } }, 400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } } },
      },
    },
    '/api/v1/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login user',
        security: [],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', format: 'email' }, password: { type: 'string' } } } } } },
        responses: { 200: { description: 'Login successful', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, token: { type: 'string' } } } } } }, 401: { description: 'Invalid credentials' } },
      },
    },
    '/api/v1/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Get current logged-in user',
        responses: { 200: { description: 'Current user', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/User' } } } } } } },
      },
    },
    '/api/v1/auth/forgotpassword': {
      post: {
        tags: ['Auth'],
        summary: 'Forgot password — sends reset token',
        security: [],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email'], properties: { email: { type: 'string', format: 'email' } } } } } },
        responses: { 200: { description: 'Reset token sent' }, 404: { description: 'User not found' } },
      },
    },
    '/api/v1/auth/reset-password': {
      post: {
        tags: ['Auth'],
        summary: 'Reset password with token',
        security: [],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['token', 'newPassword'], properties: { token: { type: 'string', description: 'Reset token received via email' }, newPassword: { type: 'string', minLength: 6 } } } } } },
        responses: { 200: { description: 'Password reset successful' }, 400: { description: 'Invalid or expired token' } },
      },
    },

    // ─── Users ───────────────────────────────────────
    '/api/v1/users': {
      get: {
        tags: ['Users'],
        summary: 'Get all users (Admin only)',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } },
          { name: 'sort', in: 'query', schema: { type: 'string' } },
          { name: 'select', in: 'query', schema: { type: 'string' } },
          { name: 'role', in: 'query', schema: { type: 'string', enum: ['admin', 'staff', 'partner'] } },
        ],
        responses: { 200: { description: 'Users list', content: { 'application/json': { schema: { $ref: '#/components/schemas/Pagination' } } } } },
      },
      post: {
        tags: ['Users'],
        summary: 'Create user (Admin only)',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/UserInput' } } } },
        responses: { 201: { description: 'User created', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/User' } } } } } } },
      },
    },
    '/api/v1/users/{id}': {
      get: {
        tags: ['Users'],
        summary: 'Get single user (Admin only)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'User found' }, 404: { description: 'User not found' } },
      },
      put: {
        tags: ['Users'],
        summary: 'Update user (Admin only)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/UserInput' } } } },
        responses: { 200: { description: 'User updated' }, 404: { description: 'User not found' } },
      },
      delete: {
        tags: ['Users'],
        summary: 'Delete user (Admin only)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'User deleted' }, 404: { description: 'User not found' } },
      },
    },

    // ─── Projects ────────────────────────────────────
    '/api/v1/projects': {
      get: {
        tags: ['Projects'],
        summary: 'Get all projects',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } },
          { name: 'sort', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['Planning', 'Active', 'Completed', 'On Hold'] } },
          { name: 'category', in: 'query', schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Projects list', content: { 'application/json': { schema: { $ref: '#/components/schemas/Pagination' } } } } },
      },
      post: {
        tags: ['Projects'],
        summary: 'Create project (Admin)',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ProjectInput' } } } },
        responses: { 201: { description: 'Project created' } },
      },
    },
    '/api/v1/projects/{id}': {
      get: {
        tags: ['Projects'],
        summary: 'Get single project',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Project found' }, 404: { description: 'Not found' } },
      },
      put: {
        tags: ['Projects'],
        summary: 'Update project (Admin)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ProjectInput' } } } },
        responses: { 200: { description: 'Project updated' } },
      },
      delete: {
        tags: ['Projects'],
        summary: 'Delete project (Admin)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Project deleted' } },
      },
    },
    '/api/v1/projects/radius/{zipcode}/{distance}': {
      get: {
        tags: ['Projects'],
        summary: 'Get projects within radius',
        parameters: [
          { name: 'zipcode', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'distance', in: 'path', required: true, schema: { type: 'number' } },
        ],
        responses: { 200: { description: 'Projects in radius' } },
      },
    },

    // ─── Plots ───────────────────────────────────────
    '/api/v1/plots': {
      get: {
        tags: ['Plots'],
        summary: 'Get all plots',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } },
          { name: 'sort', in: 'query', schema: { type: 'string' } },
          { name: 'projectId', in: 'query', schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Plots list', content: { 'application/json': { schema: { $ref: '#/components/schemas/Pagination' } } } } },
      },
      post: {
        tags: ['Plots'],
        summary: 'Create plot',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/PlotInput' } } } },
        responses: { 201: { description: 'Plot created' } },
      },
    },
    '/api/v1/plots/{id}': {
      get: {
        tags: ['Plots'],
        summary: 'Get single plot',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Plot found' }, 404: { description: 'Not found' } },
      },
      put: {
        tags: ['Plots'],
        summary: 'Update plot',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/PlotInput' } } } },
        responses: { 200: { description: 'Plot updated' } },
      },
      delete: {
        tags: ['Plots'],
        summary: 'Delete plot',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Plot deleted' } },
      },
    },
    '/api/v1/plots/status/{status}': {
      get: {
        tags: ['Plots'],
        summary: 'Get plots by status',
        parameters: [{ name: 'status', in: 'path', required: true, schema: { type: 'string', enum: ['Available', 'Booked', 'Reserved', 'Canceled'] } }],
        responses: { 200: { description: 'Plots filtered by status' } },
      },
    },
    '/api/v1/plots/project/{projectId}': {
      get: {
        tags: ['Plots'],
        summary: 'Get plots by project',
        parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Plots for project' } },
      },
    },

    // ─── Leads ───────────────────────────────────────
    '/api/v1/leads': {
      get: {
        tags: ['Leads'],
        summary: 'Get all leads',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } },
          { name: 'sort', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'sourceType', in: 'query', schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Leads list', content: { 'application/json': { schema: { $ref: '#/components/schemas/Pagination' } } } } },
      },
      post: {
        tags: ['Leads'],
        summary: 'Create lead',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/LeadInput' } } } },
        responses: { 201: { description: 'Lead created' } },
      },
    },
    '/api/v1/leads/{id}': {
      get: {
        tags: ['Leads'],
        summary: 'Get single lead',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Lead found' }, 404: { description: 'Not found' } },
      },
      put: {
        tags: ['Leads'],
        summary: 'Update lead',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/LeadInput' } } } },
        responses: { 200: { description: 'Lead updated' } },
      },
      delete: {
        tags: ['Leads'],
        summary: 'Delete lead',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Lead deleted' } },
      },
    },
    '/api/v1/leads/status/{status}': {
      get: {
        tags: ['Leads'],
        summary: 'Get leads by status',
        parameters: [{ name: 'status', in: 'path', required: true, schema: { type: 'string', enum: ['Open', 'Qualified', 'Unqualified', 'Customer'] } }],
        responses: { 200: { description: 'Leads filtered by status' } },
      },
    },
    '/api/v1/leads/user/{userId}': {
      get: {
        tags: ['Leads'],
        summary: 'Get leads by assigned user',
        parameters: [{ name: 'userId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Leads for user' } },
      },
    },
    '/api/v1/leads/project/{projectId}': {
      get: {
        tags: ['Leads'],
        summary: 'Get leads by project',
        parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Leads for project' } },
      },
    },

    // ─── Tasks ───────────────────────────────────────
    '/api/v1/tasks': {
      get: {
        tags: ['Tasks'],
        summary: 'Get all tasks',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } },
          { name: 'sort', in: 'query', schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Tasks list', content: { 'application/json': { schema: { $ref: '#/components/schemas/Pagination' } } } } },
      },
      post: {
        tags: ['Tasks'],
        summary: 'Create task',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/TaskInput' } } } },
        responses: { 201: { description: 'Task created' } },
      },
    },
    '/api/v1/tasks/{id}': {
      get: {
        tags: ['Tasks'],
        summary: 'Get single task',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Task found' }, 404: { description: 'Not found' } },
      },
      put: {
        tags: ['Tasks'],
        summary: 'Update task',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/TaskInput' } } } },
        responses: { 200: { description: 'Task updated' } },
      },
      delete: {
        tags: ['Tasks'],
        summary: 'Delete task',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Task deleted' } },
      },
    },
    '/api/v1/tasks/status/{status}': {
      get: {
        tags: ['Tasks'],
        summary: 'Get tasks by status',
        parameters: [{ name: 'status', in: 'path', required: true, schema: { type: 'string', enum: ['To Do', 'In Progress', 'In Review', 'Done'] } }],
        responses: { 200: { description: 'Tasks filtered by status' } },
      },
    },
    '/api/v1/tasks/priority/{priority}': {
      get: {
        tags: ['Tasks'],
        summary: 'Get tasks by priority',
        parameters: [{ name: 'priority', in: 'path', required: true, schema: { type: 'string', enum: ['Low', 'Medium', 'High'] } }],
        responses: { 200: { description: 'Tasks filtered by priority' } },
      },
    },
    '/api/v1/tasks/assignee/{assigneeId}': {
      get: {
        tags: ['Tasks'],
        summary: 'Get tasks by assignee',
        parameters: [{ name: 'assigneeId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Tasks for assignee' } },
      },
    },
    '/api/v1/tasks/project/{projectId}': {
      get: {
        tags: ['Tasks'],
        summary: 'Get tasks by project',
        parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Tasks for project' } },
      },
    },

    // ─── Attendance ──────────────────────────────────
    '/api/v1/attendance': {
      get: {
        tags: ['Attendance'],
        summary: 'Get all attendance records',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } },
        ],
        responses: { 200: { description: 'Attendance list', content: { 'application/json': { schema: { $ref: '#/components/schemas/Pagination' } } } } },
      },
      post: {
        tags: ['Attendance'],
        summary: 'Create attendance record',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/AttendanceInput' } } } },
        responses: { 201: { description: 'Attendance created' } },
      },
    },
    '/api/v1/attendance/{id}': {
      get: {
        tags: ['Attendance'],
        summary: 'Get single attendance record',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Record found' }, 404: { description: 'Not found' } },
      },
      put: {
        tags: ['Attendance'],
        summary: 'Update attendance record',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/AttendanceInput' } } } },
        responses: { 200: { description: 'Record updated' } },
      },
      delete: {
        tags: ['Attendance'],
        summary: 'Delete attendance record',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Record deleted' } },
      },
    },
    '/api/v1/attendance/today': {
      get: {
        tags: ['Attendance'],
        summary: "Get today's attendance",
        responses: { 200: { description: "Today's records" } },
      },
    },
    '/api/v1/attendance/staff/{staffId}': {
      get: {
        tags: ['Attendance'],
        summary: 'Get attendance by staff member',
        parameters: [{ name: 'staffId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Staff attendance records' } },
      },
    },
    '/api/v1/attendance/date/{date}': {
      get: {
        tags: ['Attendance'],
        summary: 'Get attendance by date',
        parameters: [{ name: 'date', in: 'path', required: true, schema: { type: 'string', example: '2025-06-03' } }],
        responses: { 200: { description: 'Records for date' } },
      },
    },

    // ─── Channel Partners ────────────────────────────
    '/api/v1/channel-partners': {
      get: {
        tags: ['Channel Partners'],
        summary: 'Get all channel partners',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } },
        ],
        responses: { 200: { description: 'Partners list', content: { 'application/json': { schema: { $ref: '#/components/schemas/Pagination' } } } } },
      },
      post: {
        tags: ['Channel Partners'],
        summary: 'Create channel partner (Admin)',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ChannelPartnerInput' } } } },
        responses: { 201: { description: 'Partner created' } },
      },
    },
    '/api/v1/channel-partners/{id}': {
      get: {
        tags: ['Channel Partners'],
        summary: 'Get single channel partner',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Partner found' }, 404: { description: 'Not found' } },
      },
      put: {
        tags: ['Channel Partners'],
        summary: 'Update channel partner (Admin)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ChannelPartnerInput' } } } },
        responses: { 200: { description: 'Partner updated' } },
      },
      delete: {
        tags: ['Channel Partners'],
        summary: 'Delete channel partner (Admin)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Partner deleted' } },
      },
    },
    '/api/v1/channel-partners/active': {
      get: {
        tags: ['Channel Partners'],
        summary: 'Get active channel partners',
        responses: { 200: { description: 'Active partners' } },
      },
    },
    '/api/v1/channel-partners/city/{city}': {
      get: {
        tags: ['Channel Partners'],
        summary: 'Get channel partners by city',
        parameters: [{ name: 'city', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Partners in city' } },
      },
    },

    // ─── Notifications ───────────────────────────────
    '/api/v1/notifications': {
      get: {
        tags: ['Notifications'],
        summary: 'Get all notifications',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } },
        ],
        responses: { 200: { description: 'Notifications list', content: { 'application/json': { schema: { $ref: '#/components/schemas/Pagination' } } } } },
      },
      post: {
        tags: ['Notifications'],
        summary: 'Create notification',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/NotificationInput' } } } },
        responses: { 201: { description: 'Notification created' } },
      },
    },
    '/api/v1/notifications/{id}': {
      get: {
        tags: ['Notifications'],
        summary: 'Get single notification',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Notification found' }, 404: { description: 'Not found' } },
      },
      put: {
        tags: ['Notifications'],
        summary: 'Update notification',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/NotificationInput' } } } },
        responses: { 200: { description: 'Notification updated' } },
      },
      delete: {
        tags: ['Notifications'],
        summary: 'Delete notification',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Notification deleted' } },
      },
    },
    '/api/v1/notifications/unread': {
      get: {
        tags: ['Notifications'],
        summary: 'Get unread notifications',
        responses: { 200: { description: 'Unread notifications' } },
      },
    },
    '/api/v1/notifications/{id}/read': {
      put: {
        tags: ['Notifications'],
        summary: 'Mark notification as read',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Marked as read' } },
      },
    },
    '/api/v1/notifications/read/all': {
      put: {
        tags: ['Notifications'],
        summary: 'Mark all notifications as read',
        responses: { 200: { description: 'All marked as read' } },
      },
    },

    // ─── Groups ──────────────────────────────────────
    '/api/v1/groups': {
      get: {
        tags: ['Groups'],
        summary: 'Get all groups (Admin)',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } },
        ],
        responses: { 200: { description: 'Groups list', content: { 'application/json': { schema: { $ref: '#/components/schemas/Pagination' } } } } },
      },
      post: {
        tags: ['Groups'],
        summary: 'Create group (Admin)',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/GroupInput' } } } },
        responses: { 201: { description: 'Group created' } },
      },
    },
    '/api/v1/groups/{id}': {
      get: {
        tags: ['Groups'],
        summary: 'Get single group (Admin)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Group found' }, 404: { description: 'Not found' } },
      },
      put: {
        tags: ['Groups'],
        summary: 'Update group (Admin)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/GroupInput' } } } },
        responses: { 200: { description: 'Group updated' } },
      },
      delete: {
        tags: ['Groups'],
        summary: 'Delete group (Admin)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Group deleted' } },
      },
    },
    '/api/v1/groups/{id}/members': {
      post: {
        tags: ['Groups'],
        summary: 'Add member to group (Admin)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['userId'], properties: { userId: { type: 'string' } } } } } },
        responses: { 200: { description: 'Member added' }, 400: { description: 'Already a member' } },
      },
    },
    '/api/v1/groups/{id}/members/{userId}': {
      delete: {
        tags: ['Groups'],
        summary: 'Remove member from group (Admin)',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'userId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Member removed' }, 400: { description: 'Not a member' } },
      },
    },

    // ─── Activity Logs ───────────────────────────────
    '/api/v1/activity-logs': {
      get: {
        tags: ['Activity Logs'],
        summary: 'Get all activity logs (Admin)',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } },
          { name: 'sort', in: 'query', schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Activity logs', content: { 'application/json': { schema: { $ref: '#/components/schemas/Pagination' } } } } },
      },
      post: {
        tags: ['Activity Logs'],
        summary: 'Create activity log',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ActivityLogInput' } } } },
        responses: { 201: { description: 'Log created' } },
      },
    },
    '/api/v1/activity-logs/{id}': {
      get: {
        tags: ['Activity Logs'],
        summary: 'Get single activity log (Admin)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Log found' }, 404: { description: 'Not found' } },
      },
      delete: {
        tags: ['Activity Logs'],
        summary: 'Delete activity log (Admin)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Log deleted' } },
      },
    },
    '/api/v1/activity-logs/recent': {
      get: {
        tags: ['Activity Logs'],
        summary: 'Get recent activity logs (Admin)',
        parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } }],
        responses: { 200: { description: 'Recent logs' } },
      },
    },
    '/api/v1/activity-logs/entity/{entityType}': {
      get: {
        tags: ['Activity Logs'],
        summary: 'Get activity logs by entity type (Admin)',
        parameters: [{ name: 'entityType', in: 'path', required: true, schema: { type: 'string', example: 'Lead' } }],
        responses: { 200: { description: 'Logs for entity type' } },
      },
    },
    '/api/v1/activity-logs/action/{actionType}': {
      get: {
        tags: ['Activity Logs'],
        summary: 'Get activity logs by action type (Admin)',
        parameters: [{ name: 'actionType', in: 'path', required: true, schema: { type: 'string', enum: ['Created', 'Updated', 'Deleted', 'Status Change'] } }],
        responses: { 200: { description: 'Logs for action type' } },
      },
    },

    // --- File Uploads ---
    '/api/v1/uploads/{category}': {
      post: {
        tags: ['File Uploads'],
        summary: 'Upload files to a category',
        description: 'Upload files. Categories: projects, plots, kyc, general. Images and PDFs accepted. Max 10MB.',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['files'],
                properties: {
                  files: {
                    type: 'array',
                    items: { type: 'string', format: 'binary' },
                    description: 'Files to upload',
                  },
                },
              },
            },
          },
        },
        parameters: [{ name: 'category', in: 'path', required: true, schema: { type: 'string', enum: ['projects', 'plots', 'kyc', 'general'] } }],
        responses: {
          201: {
            description: 'Files uploaded',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    count: { type: 'number' },
                    data: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          filename: { type: 'string' },
                          originalName: { type: 'string' },
                          mimetype: { type: 'string' },
                          size: { type: 'number' },
                          category: { type: 'string' },
                          path: { type: 'string' },
                          uploadedAt: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: 'No files or invalid category' },
        },
      },
      get: {
        tags: ['File Uploads'],
        summary: 'List files in a category',
        parameters: [{ name: 'category', in: 'path', required: true, schema: { type: 'string', enum: ['projects', 'plots', 'kyc', 'general'] } }],
        responses: {
          200: {
            description: 'Files list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    count: { type: 'number' },
                    data: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          filename: { type: 'string' },
                          size: { type: 'number' },
                          uploadedAt: { type: 'string' },
                          path: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/uploads/{category}/{filename}': {
      delete: {
        tags: ['File Uploads'],
        summary: 'Delete a file',
        parameters: [
          { name: 'category', in: 'path', required: true, schema: { type: 'string', enum: ['projects', 'plots', 'kyc', 'general'] } },
          { name: 'filename', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'File deleted' }, 404: { description: 'File not found' } },
      },
    },
  },
  tags: [
    { name: 'Health', description: 'Server health check' },
    { name: 'Auth', description: 'User authentication & registration' },
    { name: 'Users', description: 'User management (Admin only)' },
    { name: 'Projects', description: 'Real estate project management' },
    { name: 'Plots', description: 'Plot management within projects' },
    { name: 'Leads', description: 'Lead management & tracking' },
    { name: 'Tasks', description: 'Task management & assignment' },
    { name: 'Attendance', description: 'Staff attendance tracking' },
    { name: 'Channel Partners', description: 'Channel partner management' },
    { name: 'Notifications', description: 'Notification management' },
    { name: 'Groups', description: 'Staff group management (Admin)' },
    { name: 'Activity Logs', description: 'Audit trail & activity logging (Admin)' },
  ],
};

module.exports = swaggerSpec;
