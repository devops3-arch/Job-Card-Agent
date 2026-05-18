import express from "express";

const router = express.Router();

router.get("/status", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Integration placeholders are ready",
    data: {
      zoho: "available",
      n8n: "available",
      openai: "available",
    },
  });
});

export default router;
