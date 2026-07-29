const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swaggerSpec');

const swaggerSetup = (app) => {
  const options = {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'CRM API Documentation',
  };

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, options));

  // Serve raw spec as JSON
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
};

module.exports = swaggerSetup;
