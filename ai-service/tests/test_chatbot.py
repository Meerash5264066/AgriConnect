"""Tests for the context-aware farmer agronomist chatbot."""

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_chat_empty_message_rejected():
    """Verify empty message payload returns HTTP 400 or 422."""
    res = client.post("/api/v1/chat", json={"message": "   "})
    assert res.status_code in (400, 422)


def test_chat_without_diagnosis_prompts_to_upload():
    """Verify asking about disease without prior scan prompts farmer to scan leaf."""
    res = client.post("/api/v1/chat", json={"message": "What disease does my plant have?"})
    assert res.status_code == 200
    data = res.json()
    assert "No leaf photo has been analyzed yet" in data["reply"]
    assert "Check Plant Health" in data["reply"] or "upload" in data["reply"].lower()
    assert len(data["suggested_questions"]) > 0


def test_chat_with_diagnosis_answers_disease_name():
    """Verify chatbot answers disease identification question using active context."""
    ctx = {
        "crop": "Tomato",
        "disease": "Tomato Early blight",
        "predicted_class": "Tomato___Tomato Early blight",
        "confidence": 0.884,
        "confidence_assessment": "high",
        "remedy_recommendation": "Prune infected lower leaves and apply organic mulch.",
    }
    res = client.post(
        "/api/v1/chat",
        json={"message": "What disease does my plant have?", "diagnosis_context": ctx},
    )
    assert res.status_code == 200
    data = res.json()
    reply = data["reply"]
    assert "Tomato" in reply
    assert "Early blight" in reply
    assert "88.4%" in reply
    assert data["context_used"]["crop"] == "Tomato"


def test_chat_explains_causes_of_spots():
    """Verify chatbot explains biological causes and conditions behind symptoms."""
    ctx = {
        "crop": "Tomato",
        "disease": "Tomato Early blight",
        "predicted_class": "Tomato___Tomato Early blight",
        "confidence": 0.884,
        "confidence_assessment": "high",
    }
    res = client.post(
        "/api/v1/chat",
        json={"message": "Why are these spots appearing on my leaves?", "diagnosis_context": ctx},
    )
    assert res.status_code == 200
    reply = res.json()["reply"]
    assert "Alternaria solani" in reply or "fung" in reply.lower()
    assert "wetness" in reply.lower() or "humidity" in reply.lower() or "splash" in reply.lower()


def test_chat_immediate_first_steps():
    """Verify chatbot provides concrete initial action steps."""
    ctx = {
        "crop": "Potato",
        "disease": "Potato Late blight",
        "predicted_class": "Potato___Potato Late blight",
        "confidence": 0.92,
        "confidence_assessment": "high",
    }
    res = client.post(
        "/api/v1/chat",
        json={"message": "What should I do first?", "diagnosis_context": ctx},
    )
    assert res.status_code == 200
    reply = res.json()["reply"]
    assert "1." in reply
    assert "prune" in reply.lower() or "remove" in reply.lower()
    assert "water" in reply.lower() or "drip" in reply.lower()


def test_chat_spread_risk():
    """Verify chatbot explains contagiousness and containment."""
    ctx = {
        "crop": "Tomato",
        "disease": "Tomato Bacterial spot",
        "predicted_class": "Tomato___Tomato Bacterial spot",
        "confidence": 0.79,
        "confidence_assessment": "high",
    }
    res = client.post(
        "/api/v1/chat",
        json={"message": "Can this disease spread to my other plants?", "diagnosis_context": ctx},
    )
    assert res.status_code == 200
    reply = res.json()["reply"]
    assert "spread" in reply.lower()
    assert "rain" in reply.lower() or "splash" in reply.lower() or "wind" in reply.lower() or "wet" in reply.lower()


def test_chat_treatment_natural_vs_chemical():
    """Verify treatment advice distinguishes natural care and plant medicine with safety notice."""
    ctx = {
        "crop": "Apple",
        "disease": "Apple Scab",
        "predicted_class": "Apple___Apple Scab",
        "confidence": 0.85,
        "confidence_assessment": "high",
    }
    res = client.post(
        "/api/v1/chat",
        json={"message": "What treatment is suitable?", "diagnosis_context": ctx},
    )
    assert res.status_code == 200
    reply = res.json()["reply"]
    assert "Natural Care" in reply
    assert "Medicine for the Plant" in reply
    assert "Safety Notice" in reply or "label" in reply.lower()


def test_chat_reliability_and_low_confidence_disclosure():
    """Verify chatbot honestly evaluates confidence without guaranteeing infallibility."""
    ctx = {
        "crop": "Tomato",
        "disease": "Tomato Yellow Leaf Curl Virus",
        "predicted_class": "Tomato___Tomato Yellow Leaf Curl Virus",
        "confidence": 0.41,
        "confidence_assessment": "low",
    }
    res = client.post(
        "/api/v1/chat",
        json={"message": "Is this result reliable?", "diagnosis_context": ctx},
    )
    assert res.status_code == 200
    reply = res.json()["reply"]
    assert "41.0%" in reply
    assert "low" in reply.lower() or "uncertain" in reply.lower()
    assert "sharper photo" in reply.lower() or "daylight" in reply.lower() or "consult" in reply.lower()


def test_chat_responds_to_different_crop_without_repeating_tomato():
    """Verify asking about wheat while tomato is diagnosed provides wheat guidance, not tomato."""
    ctx = {
        "crop": "Tomato",
        "disease": "Tomato Early blight",
        "predicted_class": "Tomato___Tomato Early blight",
        "confidence": 0.90,
    }
    res = client.post(
        "/api/v1/chat",
        json={"message": "What is the recommended fertilizer for wheat?", "diagnosis_context": ctx},
    )
    assert res.status_code == 200
    reply = res.json()["reply"]
    assert "wheat" in reply.lower()
    # Must NOT claim this is tomato cultivation
    assert "Tomato cultivation" not in reply


def test_chat_updates_when_new_diagnosis_received():
    """Verify switching from tomato to potato context shifts chatbot answers."""
    potato_ctx = {
        "crop": "Potato",
        "disease": "Potato Early blight",
        "predicted_class": "Potato___Potato Early blight",
        "confidence": 0.87,
        "confidence_assessment": "high",
    }
    res = client.post(
        "/api/v1/chat",
        json={"message": "What disease does my plant have?", "diagnosis_context": potato_ctx},
    )
    assert res.status_code == 200
    reply = res.json()["reply"]
    assert "Potato" in reply
    assert "Tomato" not in reply or "potato" in reply.lower()


def test_chat_healthy_leaf_advice():
    """Verify healthy leaf diagnosis reassures farmer and gives preventative advice."""
    healthy_ctx = {
        "crop": "Bell pepper",
        "disease": "Bell pepper Healthy",
        "predicted_class": "Bell pepper___Bell pepper Healthy",
        "confidence": 0.95,
        "confidence_assessment": "high",
    }
    res = client.post(
        "/api/v1/chat",
        json={"message": "Is anything wrong with my bell pepper?", "diagnosis_context": healthy_ctx},
    )
    assert res.status_code == 200
    reply = res.json()["reply"]
    assert "healthy" in reply.lower()
    assert "no visible fungal" in reply.lower() or "good news" in reply.lower()
