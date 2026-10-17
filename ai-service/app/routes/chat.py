"""Farmer-friendly agronomist chatbot routes with diagnosis session context."""

import logging
import re
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, status

from app.schemas.common import ChatRequest, ChatResponse, DiagnosisContext
from app.services.disease_advisory import (
    DISEASE_KNOWLEDGE_BASE,
    SUPPORTED_CROPS,
    get_advisory_for_class,
    assess_confidence,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["Farmer Chatbot"])


def _extract_crop_mention(text: str) -> Optional[str]:
    """Check if the user is asking about a specific crop."""
    t_lower = text.lower()
    crop_keywords = {
        "tomato": "Tomato",
        "potato": "Potato",
        "wheat": "Wheat",
        "rice": "Paddy / Rice",
        "paddy": "Paddy / Rice",
        "corn": "Corn / Maize",
        "maize": "Corn / Maize",
        "cotton": "Cotton",
        "apple": "Apple",
        "grape": "Grape",
        "pepper": "Bell pepper",
        "capsicum": "Bell pepper",
        "citrus": "Citrus",
        "lemon": "Citrus",
        "orange": "Citrus",
        "strawberry": "Strawberry",
        "peach": "Peach",
        "cherry": "Cherry",
    }
    for kw, name in crop_keywords.items():
        if re.search(rf"\b{kw}\b", t_lower):
            return name
    return None


def _generate_general_agronomy_answer(query: str, crop_mentioned: Optional[str]) -> Dict[str, Any]:
    """Provide verified agronomic guidance for general farming queries without repeating canned tomato advice."""
    q_lower = query.lower()

    if "flower" in q_lower and ("drop" in q_lower or "fall" in q_lower or "shed" in q_lower):
        crop = crop_mentioned or "solanaceous crops"
        return {
            "reply": (
                f"To prevent flower and fruitlet drop in {crop}:\n"
                "1. **Moisture management:** Avoid drought stress followed by heavy flooding during bloom. Keep soil evenly moist.\n"
                "2. **Nitrogen balance:** Excessive urea/nitrogen promotes lush vegetative growth at the expense of flowers.\n"
                "3. **Micronutrient spray:** Boron deficiency often causes poor pollination. A foliar spray of solubor/borax (1g/L) during pre-bloom can help.\n"
                "4. **Temperature:** Extreme heat (above 35°C) inhibits pollen viability. Maintain light mulching to keep root zones cooler."
            ),
            "suggested": [
                "What fertilizer schedule is best?",
                "How often should I irrigate during flowering?",
                "How to protect flowers from pest attacks?",
            ],
        }

    if "fertilizer" in q_lower or "npk" in q_lower or "nutrient" in q_lower or "urea" in q_lower or "dap" in q_lower:
        crop = crop_mentioned or "vegetable and field crops"
        return {
            "reply": (
                f"Nutrient management for {crop}:\n"
                "1. **Basal dose:** Apply well-rotted Farm Yard Manure (FYM) or vermicompost along with required phosphorus (DAP/SSP) and half potassium at planting.\n"
                "2. **Vegetative stage:** Apply nitrogen in split doses to sustain stem and leaf growth.\n"
                "3. **Flowering and fruiting:** Shift nutrition toward potassium and secondary micronutrients (calcium, magnesium, boron) to support fruit bulking and disease resistance.\n"
                "4. **Soil testing:** We recommend a soil health card test at your nearest KVK every 2 seasons to avoid over-fertilizing."
            ),
            "suggested": [
                "How to prepare organic compost?",
                "What micronutrients prevent yellowing leaves?",
                "How does soil pH affect fertilizer uptake?",
            ],
        }

    if "water" in q_lower or "irrigation" in q_lower or "drip" in q_lower:
        crop = crop_mentioned or "crops"
        return {
            "reply": (
                f"Irrigation best practices for {crop}:\n"
                "1. **Morning irrigation:** Water early in the morning so plant foliage dries quickly in the sunlight, reducing fungal spore germination.\n"
                "2. **Drip watering:** Deliver water directly to root zones. Overhead sprinklers splash fungal spores from soil onto leaves.\n"
                "3. **Mulching:** Use straw, crop residue, or plastic mulch to conserve root zone moisture and reduce weed competition.\n"
                "4. **Drainage:** Ensure field furrows allow excess rainwater to drain within 24 hours to prevent root suffocation and damping off."
            ),
            "suggested": [
                "How does overhead watering increase leaf disease?",
                "What mulching materials are best?",
                "How to detect root rot from overwatering?",
            ],
        }

    if "organic" in q_lower or "neem" in q_lower or "jeevamrit" in q_lower or "natural" in q_lower:
        return {
            "reply": (
                "Organic plant protection methods:\n"
                "1. **Neem oil spray:** Cold-pressed neem oil (3-5 ml/L) emulsified with mild liquid soap repels sucking pests and suppresses surface mildew.\n"
                "2. **Sour buttermilk (Lassi):** Fermented buttermilk diluted 1:10 with water acts as a protective bio-fungicide against early powdery and downy mildews.\n"
                "3. **Jeevamrit:** Ferment cow dung, cow urine, jaggery, pulse flour, and virgin soil for 5-7 days; apply via irrigation to stimulate beneficial soil microbes.\n"
                "4. **Trichoderma viride:** Apply Trichoderma bio-agent mixed with compost to protect seedling roots against soil-borne damping off."
            ),
            "suggested": [
                "How to prepare Jeevamrit at home?",
                "How often can I spray neem oil?",
                "What bio-fungicides control leaf blight?",
            ],
        }

    if "weed" in q_lower or "grass" in q_lower:
        return {
            "reply": (
                "Weed management guidance:\n"
                "1. Maintain manual weeding or shallow inter-cultivation within the first 30-45 days of crop establishment.\n"
                "2. Use organic mulch (straw/paddy husk) between rows to block sunlight from reaching weed seeds.\n"
                "3. Do not let weeds flower along field bunds, as they host whiteflies, thrips, and viral pathogens."
            ),
            "suggested": [
                "How do weeds spread plant viruses?",
                "What mulches suppress weeds best?",
            ],
        }

    # General fallback tailored to the crop or general farming
    target = f"{crop_mentioned} farming" if crop_mentioned else "crop cultivation and plant health"
    return {
        "reply": (
            f"Here are key recommendations for successful {target}:\n"
            "• Use certified disease-free seeds and resistant hybrid varieties suited to your agro-climatic zone.\n"
            "• Maintain proper plant-to-plant and row-to-row spacing for maximum sun exposure and air movement.\n"
            "• Regularly inspect leaf undersides for early signs of pests, spots, or nutrient deficiencies.\n"
            "• For specific plant diagnoses, you can upload a leaf photograph using the 'Check Plant Health' scanner above."
        ),
        "suggested": [
            "How do I scan a leaf for disease?",
            "What crops does the plant health scanner support?",
            "How to prevent fungal leaf diseases?",
        ],
    }


@router.post(
    "",
    response_model=ChatResponse,
    summary="Farmer Agronomist Context-Aware Chatbot",
    description="Answers farmer questions using current leaf diagnosis context or verified agronomic knowledge.",
)
async def chat_with_agronomist(request: ChatRequest) -> ChatResponse:
    """Process farmer inquiry with active leaf diagnosis context or general agronomic knowledge."""
    query = request.message.strip()
    if not query:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error_code": "EMPTY_MESSAGE", "message": "Message cannot be empty."},
        )

    ctx: Optional[DiagnosisContext] = request.diagnosis_context
    q_lower = query.lower()

    # Determine if active diagnosis session is available
    has_diagnosis = bool(
        ctx and (ctx.predicted_class or ctx.disease) and ctx.crop and ctx.crop.lower() != "unknown"
    )

    crop = ctx.crop if has_diagnosis else None
    disease = ctx.disease if has_diagnosis else None
    pred_class = ctx.predicted_class if has_diagnosis else None
    is_healthy = False
    if has_diagnosis and disease:
        is_healthy = "healthy" in disease.lower()

    # Retrieve full advisory if class is known
    advisory = get_advisory_for_class(pred_class) if pred_class else {}
    if not advisory and has_diagnosis:
        advisory = {
            "crop": crop,
            "disease": disease,
            "is_healthy": is_healthy,
            "cause": ctx.remedy_recommendation or "Crop foliage condition",
            "organic_treatment": ctx.organic_treatment or "Maintain balanced field hygiene and drip irrigation.",
            "chemical_treatment": ctx.chemical_treatment or "Consult your local agricultural extension officer.",
            "general_care": ctx.general_care or "Sanitize pruning tools and inspect surrounding rows.",
            "spread_risk": "Observe nearby plants for similar symptoms.",
        }

    conf_pct = f"{round((ctx.confidence or 0.0) * 100, 1)}%" if (ctx and ctx.confidence) else "N/A"
    conf_level = ctx.confidence_assessment if (ctx and ctx.confidence_assessment) else "moderate"

    # Check if user explicitly asked about a DIFFERENT crop than the diagnosed one
    crop_mentioned = _extract_crop_mention(query)
    is_asking_other_crop = bool(
        crop_mentioned and has_diagnosis and crop and (crop_mentioned.lower() not in crop.lower())
    )

    # Context usage tracking
    context_used: Dict[str, Any] = {}
    if has_diagnosis and not is_asking_other_crop:
        context_used = {
            "crop": crop,
            "disease": disease,
            "confidence": ctx.confidence if ctx else None,
            "confidence_assessment": conf_level,
            "is_healthy": is_healthy,
        }

    # -------------------------------------------------------------
    # CASE 1: Query is about a DIFFERENT crop than the current diagnosis
    # -------------------------------------------------------------
    if is_asking_other_crop:
        result = _generate_general_agronomy_answer(query, crop_mentioned)
        return ChatResponse(
            reply=result["reply"],
            source="verified_agronomic_engine",
            context_used=None,
            suggested_questions=result["suggested"],
        )

    # -------------------------------------------------------------
    # CASE 2: No leaf diagnosis context available
    # -------------------------------------------------------------
    if not has_diagnosis:
        # Check if asking general diagnosis question without having scanned
        if any(w in q_lower for w in ["what disease", "what plant", "diagnos", "my leaf", "these spots", "why spots"]):
            return ChatResponse(
                reply=(
                    "No leaf photo has been analyzed yet in this session.\n\n"
                    "To check your plant:\n"
                    "1. Scroll up to the **Check Plant Health** scanner.\n"
                    "2. Tap **'Tap to capture or upload leaf photo'** to upload a clear picture of the leaf in daylight.\n"
                    "3. Click **'Check My Plant'**.\n\n"
                    f"Our visual scanner currently recognizes 10 crops: {', '.join(SUPPORTED_CROPS)}. "
                    "Alternatively, describe your crop and what you see on the leaf (e.g. yellowing, black spots, white powder) and I will guide you."
                ),
                source="verified_agronomic_engine",
                context_used=None,
                suggested_questions=[
                    "What crops does the plant health scanner support?",
                    "How do I take a good leaf photo?",
                    "How to prevent fungal leaf diseases?",
                ],
            )
        # General query handling
        result = _generate_general_agronomy_answer(query, crop_mentioned)
        return ChatResponse(
            reply=result["reply"],
            source="verified_agronomic_engine",
            context_used=None,
            suggested_questions=result["suggested"],
        )

    # -------------------------------------------------------------
    # CASE 3: Active leaf diagnosis context is present!
    # -------------------------------------------------------------

    # Sub-case: Healthy foliage
    if is_healthy:
        if any(w in q_lower for w in ["disease", "problem", "wrong", "sick", "infected"]):
            return ChatResponse(
                reply=(
                    f"Good news! The visual model diagnosed your **{crop} leaf as healthy** with {conf_pct} confidence. "
                    "There are no visible fungal lesions, bacterial spots, or viral curling patterns detected.\n\n"
                    "To keep your foliage healthy:\n"
                    "• Maintain balanced drip irrigation (avoid saturated or bone-dry soil).\n"
                    "• Apply organic compost around the root zone.\n"
                    "• Monitor the lower canopy weekly for any early pest or spot appearance."
                ),
                source="verified_agronomic_engine",
                context_used=context_used,
                suggested_questions=[
                    f"What fertilizer schedule is best for healthy {crop}?",
                    f"How often should I water {crop}?",
                    "What pests should I watch out for?",
                ],
            )

    # Intent 3A: "What disease does my plant have?" / "What is this?"
    if any(p in q_lower for p in ["what disease", "which disease", "what does my plant have", "what is wrong", "diagnos"]):
        reply = (
            f"Based on the leaf photo, the model identified **{crop} — {disease}** "
            f"with an AI confidence of **{conf_pct}** ({conf_level.title()} Confidence).\n\n"
            f"**Cause:** {advisory.get('cause', 'Foliage condition')}\n\n"
            "Would you like immediate steps to take, natural care recommendations, or plant medicine options?"
        )
        return ChatResponse(
            reply=reply,
            source="verified_agronomic_engine",
            context_used=context_used,
            suggested_questions=[
                "What should I do first?",
                "What natural care is recommended?",
                "Can this spread to other plants?",
                "Is this diagnosis reliable?",
            ],
        )

    # Intent 3B: "Why are these spots appearing?" / Causes
    if (
        (any(p in q_lower for p in ["why", "cause", "caused", "reason", "how come"])
         and any(s in q_lower for s in ["spot", "lesion", "blight", "mark", "yellow", "curl", "appear", "develop", "damage", "disease", "happen"]))
        or any(p in q_lower for p in ["why spots", "what caused", "cause of", "causes", "why is this"])
    ):
        reply = (
            f"**Cause of {disease} on {crop}:**\n"
            f"{advisory.get('cause', 'Environmental stress and pathogen infection.')}\n\n"
            "**Contributing field conditions:**\n"
            "• Prolonged leaf wetness from morning dew, fog, or overhead sprinkler watering.\n"
            "• High relative humidity and poor air circulation in dense plantings.\n"
            "• Soil splash carrying fungal spores onto lower leaves during rainfall."
        )
        return ChatResponse(
            reply=reply,
            source="verified_agronomic_engine",
            context_used=context_used,
            suggested_questions=[
                "What should I do first?",
                "What natural care is recommended?",
                "Can this spread to other plants?",
            ],
        )

    # Intent 3C: "What should I do first?" / Immediate action
    if any(p in q_lower for p in ["first", "immediate", "what should i do", "action", "start"]):
        reply = (
            f"**Immediate Action Plan for {disease} on {crop}:**\n"
            "1. **Prune damaged foliage:** Carefully remove severely infected lower leaves using sanitized pruning shears. Place them directly in a bag and destroy them — do not leave them on the field or in compost.\n"
            "2. **Stop overhead watering:** Water strictly at the base through drip or furrow irrigation to keep foliage completely dry.\n"
            "3. **Sanitize equipment:** Wipe tools and shears with 70% alcohol or disinfectant before moving between plants.\n"
            "4. **Inspect neighboring plants:** Walk adjacent rows to check whether nearby plants show early spotting."
        )
        return ChatResponse(
            reply=reply,
            source="verified_agronomic_engine",
            context_used=context_used,
            suggested_questions=[
                "What natural care is recommended?",
                "What plant medicine is suitable?",
                "Can this spread to other plants?",
            ],
        )

    # Intent 3D: "Can it spread to other plants?" / Spread risk
    if any(p in q_lower for p in ["spread", "contagious", "other plants", "infect other"]):
        reply = (
            f"**Spread Risk for {disease} on {crop}:**\n"
            f"{advisory.get('spread_risk', 'Can spread to surrounding susceptible plants under favorable weather.')}\n\n"
            "**How to prevent spread:**\n"
            "• Do not work in the crop field while plants are wet with morning dew or rain.\n"
            "• Remove and bag heavily infected leaves immediately.\n"
            "• Increase row spacing and trim non-bearing lower foliage to promote airflow and speed drying.\n"
            "• Clean footwear and tools before moving to uninfected field blocks."
        )
        return ChatResponse(
            reply=reply,
            source="verified_agronomic_engine",
            context_used=context_used,
            suggested_questions=[
                "What should I do first?",
                "What natural care is recommended?",
                "What plant medicine is suitable?",
            ],
        )

    # Intent 3E: "What treatment is suitable?" / Natural care / Chemical medicine
    if any(p in q_lower for p in ["treatment", "cure", "control", "remedy", "organic", "chemical", "medicine", "spray"]):
        reply = (
            f"**Management Advisory for {disease} on {crop}:**\n\n"
            f"🌿 **Natural Care (Organic / Cultural):**\n"
            f"{advisory.get('organic_treatment', 'Maintain good ventilation and soil mulching.')}\n\n"
            f"💊 **Medicine for the Plant (Chemical Treatment):**\n"
            f"{advisory.get('chemical_treatment', 'Consult local agricultural extension officer.')}\n\n"
            "⚠️ **Important Safety Notice:** Always wear protective gear (mask, gloves), check the product label for exact application intervals, and consult your local Krishi Vigyan Kendra (KVK) or agricultural officer before chemical application."
        )
        return ChatResponse(
            reply=reply,
            source="verified_agronomic_engine",
            context_used=context_used,
            suggested_questions=[
                "What should I do first?",
                "Can this spread to other plants?",
                "Is this diagnosis reliable?",
            ],
        )

    # Intent 3F: "Is this result reliable?" / Accuracy / Confidence
    if any(p in q_lower for p in ["reliable", "accurate", "confidence", "sure", "mistake", "trust"]):
        conf_eval = ""
        if (ctx.confidence or 0.0) < 0.45:
            conf_eval = (
                f"The AI model reported **{conf_pct} confidence**, which is relatively low/uncertain. "
                "Because the image pattern is ambiguous, we strongly advise taking a sharper photo in bright daylight "
                "or consulting an agricultural extension officer in person before purchasing treatments."
            )
        elif (ctx.confidence or 0.0) < 0.70:
            conf_eval = (
                f"The AI model reported **{conf_pct} confidence** (Moderate). "
                "The visual features show similarities to this condition, but please verify the observed symptoms on your field "
                "before taking intensive chemical measures."
            )
        else:
            conf_eval = (
                f"The AI model reported **{conf_pct} confidence** (High). "
                "The visual pattern matches the known disease profile closely. However, visual AI models can make mistakes; "
                "always inspect the actual leaf and consider seasonal weather patterns."
            )

        reply = (
            f"**Diagnostic Reliability for {crop} — {disease}:**\n"
            f"{conf_eval}\n\n"
            "**Best practice:** Never rely solely on an automated tool for expensive agricultural decisions. Use this as initial guidance alongside physical inspection."
        )
        return ChatResponse(
            reply=reply,
            source="verified_agronomic_engine",
            context_used=context_used,
            suggested_questions=[
                "What should I do first?",
                "What natural care is recommended?",
                "What plant medicine is suitable?",
            ],
        )

    # Default context-aware answer for any other question while diagnosed
    general_res = _generate_general_agronomy_answer(query, crop)
    reply = (
        f"Regarding your question about **{crop}** (currently diagnosed with {disease}):\n\n"
        f"{general_res['reply']}\n\n"
        f"**Note on current diagnosis:** Remember to follow sanitary pruning and watering precautions for {disease}."
    )
    return ChatResponse(
        reply=reply,
        source="verified_agronomic_engine",
        context_used=context_used,
        suggested_questions=[
            "What should I do first?",
            "What natural care is recommended?",
            "What plant medicine is suitable?",
        ],
    )
