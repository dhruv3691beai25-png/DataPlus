from google import genai
import os
from dotenv import load_dotenv

load_dotenv()

print("API KEY:", os.getenv("GEMINI_API_KEY"))

client = genai.Client(
    api_key=os.getenv("GEMINI_API_KEY")
)

response = client.models.generate_content(
    model="gemini-2.0-flash",
    contents="Explain Artificial Intelligence in one sentence."
)

print(response.text)