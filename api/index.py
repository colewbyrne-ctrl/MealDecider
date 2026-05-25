from fastapi import FastAPI

from main import app as meal_decider_app


app = FastAPI(title="Meal Decider Vercel Gateway")
app.mount("/api", meal_decider_app)
