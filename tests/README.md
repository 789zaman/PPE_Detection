These tests do not require trained weights.

Backend:
  dotnet test backend/PpeDetection.sln

AI worker:
  pip install pytest pydantic pydantic-settings pyyaml
  PYTHONPATH=ai-worker/src pytest ai-worker/tests -q
