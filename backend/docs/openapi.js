import dotenv from "dotenv";
import swaggerJsdoc from "swagger-jsdoc";

dotenv.config();

const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Job Card Management System API",
      version: "1.0.0",
      description: "API for managing job cards, pricing, approvals, signatures, and notifications.",
    },
    servers: [
      {
        url: process.env.API_BASE_URL || (process.env.NODE_ENV === "production" ? "https://your-production-url.com" : "http://localhost:5000"),
        description: process.env.NODE_ENV === "production" ? "Production server" : "Development server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        Error: {
          type: "object",
          properties: {
            success: { type: "boolean", example: false },
            message: { type: "string" },
            error: {
              type: "object",
              properties: {
                code: { type: "string" },
                details: { type: ["object", "array", "string", "null"], nullable: true },
              },
            },
          },
        },
        Success: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            message: { type: "string" },
            data: { type: ["object", "array", "string", "number", "boolean", "null"], nullable: true },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ["./server.js", "./routes/*.js"],
};

export const specs = swaggerJsdoc(swaggerOptions);
