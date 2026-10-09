from fastapi import FastAPI

from app.analysis.routes import router as analysis_router

app = FastAPI(
    title="AI Collaborative Learning Service",
    description="Document extraction, analysis and quiz-generation service.",
    version="0.1.0",
)

app.include_router(analysis_router)


@app.get("/", tags=["system"])
async def root() -> dict[str, str]:
    return {
        "service": "ai-collaborative-learning-service",
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/health", tags=["system"])
async def health() -> dict[str, str]:
    return {"status": "ok"}
