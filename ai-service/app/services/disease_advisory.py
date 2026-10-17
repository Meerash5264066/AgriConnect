"""Agronomic advisory repository for crop disease detection.

Covers the 37 classes trained in MobileNetV3-Large (agriconnect_disease_best.pth).
Provides natural care, chemical care, spread prevention, and safety advisory.
Never invents unsupported chemical dosages.
"""

from typing import Any, Dict, List, Optional

SUPPORTED_CROPS = [
    "Apple",
    "Bell pepper",
    "Cherry",
    "Citrus",
    "Corn",
    "Grape",
    "Peach",
    "Potato",
    "Strawberry",
    "Tomato",
]

DISEASE_KNOWLEDGE_BASE: Dict[str, Dict[str, Any]] = {
    "Apple___Apple Black rot": {
        "crop": "Apple",
        "disease": "Apple Black rot",
        "is_healthy": False,
        "cause": "Fungal infection caused by Botryosphaeria obtusa. Overwinters in dead wood and mummified fruit.",
        "organic_treatment": "Prune out dead wood, cankers, and mummified fruit during the dormant season. Remove and bury or burn pruned debris.",
        "chemical_treatment": "Protective copper-based or captan fungicides applied during early season under agricultural advisory. Always follow label instructions.",
        "general_care": "Ensure adequate tree spacing and pruning for good sunlight penetration and rapid foliage drying.",
        "spread_risk": "Spreads via rain splash and windblown spores, particularly after warm wet spring periods.",
    },
    "Apple___Apple Healthy": {
        "crop": "Apple",
        "disease": "Apple Healthy",
        "is_healthy": True,
        "cause": "No disease detected. Foliage shows normal chlorophyll distribution and healthy leaf margins.",
        "organic_treatment": "Continue regular orchard hygiene, organic compost mulching, and balanced drip irrigation.",
        "chemical_treatment": "No chemical treatment is needed. Avoid unnecessary pesticide applications to protect beneficial insects.",
        "general_care": "Maintain annual canopy pruning to ensure air circulation and balanced soil moisture.",
        "spread_risk": "None.",
    },
    "Apple___Apple Scab": {
        "crop": "Apple",
        "disease": "Apple Scab",
        "is_healthy": False,
        "cause": "Fungal disease caused by Venturia inaequalis. Thrives in cool, wet spring conditions.",
        "organic_treatment": "Rake and compost or destroy fallen leaves in autumn to disrupt the primary spore cycle. Apply wettable sulfur sprays early.",
        "chemical_treatment": "Protective fungicides (such as dodine or captan) applied at green-tip and pink-bud stages under local extension guidelines.",
        "general_care": "Select scab-resistant rootstocks and prune inner water sprouts to allow wind circulation.",
        "spread_risk": "Spreads rapidly during rainy periods when young leaves remain wet for 6 or more hours.",
    },
    "Apple___Cedar apple rust": {
        "crop": "Apple",
        "disease": "Cedar apple rust",
        "is_healthy": False,
        "cause": "Gymnosporangium juniperi-virginianae rust fungus requiring two alternate hosts (juniper/cedar and apple).",
        "organic_treatment": "Remove nearby wild juniper and cedar shrubs within 500 meters of the orchard where feasible.",
        "chemical_treatment": "Protective myclobutanil or mancozeb fungicides applied between pink-bud and petal fall stages as advised by crop officers.",
        "general_care": "Choose rust-resistant apple varieties when planting new orchard blocks.",
        "spread_risk": "Carried by wind over hundreds of meters from galls on alternate cedar hosts.",
    },
    "Bell pepper___Bell pepper Bacterial spot": {
        "crop": "Bell pepper",
        "disease": "Bacterial spot",
        "is_healthy": False,
        "cause": "Bacterial infection caused by Xanthomonas campestris pv. vesicatoria. Enters through stomata and wounds.",
        "organic_treatment": "Use certified pathogen-free seed. Avoid overhead sprinkler irrigation; water strictly at ground level using drip lines.",
        "chemical_treatment": "Preventive copper hydroxide spray mixed with mancozeb applied during early plant growth. Discontinue during heavy bloom.",
        "general_care": "Practice a minimum 2-year crop rotation away from peppers, tomatoes, and other solanaceous crops.",
        "spread_risk": "Transmitted by splashing rain, wind-driven rain, and handling wet plants with contaminated tools.",
    },
    "Bell pepper___Bell pepper Healthy": {
        "crop": "Bell pepper",
        "disease": "Bell pepper Healthy",
        "is_healthy": True,
        "cause": "No disease detected. Leaves are uniformly green with intact structure.",
        "organic_treatment": "Maintain balanced organic matter in soil, proper staking, and consistent drip irrigation.",
        "chemical_treatment": "No chemical treatment is needed. Monitor weekly for aphid or thrip activity.",
        "general_care": "Keep field free of solanaceous weeds and ensure good drainage to prevent waterlogging.",
        "spread_risk": "None.",
    },
    "Cherry___Cherry Healthy": {
        "crop": "Cherry",
        "disease": "Cherry Healthy",
        "is_healthy": True,
        "cause": "No disease detected. Foliage is vibrant and free of necrotic lesions.",
        "organic_treatment": "Maintain annual dormant pruning and organic mulch around the drip line.",
        "chemical_treatment": "No chemical intervention required.",
        "general_care": "Protect root zone from prolonged saturation and maintain balanced soil nutrition.",
        "spread_risk": "None.",
    },
    "Cherry___Cherry Powdery mildew": {
        "crop": "Cherry",
        "disease": "Cherry Powdery mildew",
        "is_healthy": False,
        "cause": "Podosphaera clandestina fungus producing white powdery mycelium on young foliage and fruit stems.",
        "organic_treatment": "Prune dense canopy shoots to increase airflow. Spray potassium bicarbonate or horticultural neem oil at early symptom onset.",
        "chemical_treatment": "Myclobutanil or wettable sulfur applied according to local agricultural university schedule. Avoid sulfur at temperatures above 30°C.",
        "general_care": "Avoid excessive nitrogen fertilization which stimulates overly dense, susceptible succulent growth.",
        "spread_risk": "Windblown conidia spread easily in warm, dry weather following humid mornings.",
    },
    "Citrus___Citrus Black spot": {
        "crop": "Citrus",
        "disease": "Citrus Black spot",
        "is_healthy": False,
        "cause": "Phyllosticta citricarpa fungal infection producing small round dark lesions with raised margins.",
        "organic_treatment": "Rake and mulch fallen citrus leaves to accelerate decomposition. Prune dead wood from inner canopy.",
        "chemical_treatment": "Copper oxychloride or strobilurin protective spray during fruit expansion under departmental advisories.",
        "general_care": "Ensure clean transport bins and sanitize pruning shears between grove blocks.",
        "spread_risk": "Ascospores release from decomposing leaf litter on the grove floor during warm rain events.",
    },
    "Citrus___Citrus Healthy": {
        "crop": "Citrus",
        "disease": "Citrus Healthy",
        "is_healthy": True,
        "cause": "No disease detected. Leaf flush is uniform, deep green, and free of chlorotic mottling.",
        "organic_treatment": "Maintain micronutrient soil sprays (zinc, iron, manganese) and regular drip watering.",
        "chemical_treatment": "No chemical spray needed.",
        "general_care": "Inspect undersides of young leaves weekly for citrus leaf miners and aphids.",
        "spread_risk": "None.",
    },
    "Citrus___Citrus canker": {
        "crop": "Citrus",
        "disease": "Citrus canker",
        "is_healthy": False,
        "cause": "Xanthomonas citri subsp. citri bacterium causing raised, corky lesions with oily yellow halos.",
        "organic_treatment": "Prune infected twigs 10 cm below visible lesions with shears disinfected in 70% alcohol. Plant windbreaks to minimize wind-blown abrasions.",
        "chemical_treatment": "Preventive copper-based bactericide sprays (copper hydroxide) during new vegetative flushes and early fruit set.",
        "general_care": "Strictly isolate infected blocks. Do not move equipment or fruit from infected trees during rain or high wind.",
        "spread_risk": "Highly contagious; spread by rain-driven wind, contaminated pruning equipment, and overhead irrigation.",
    },
    "Citrus___Citrus greening": {
        "crop": "Citrus",
        "disease": "Citrus greening (Huanglongbing)",
        "is_healthy": False,
        "cause": "Candidatus Liberibacter asiaticus bacterium transmitted by the Asian citrus psyllid (Diaphorina citri).",
        "organic_treatment": "Deploy yellow sticky traps to monitor psyllid populations. Apply neem oil sprays to young flushes to deter psyllids.",
        "chemical_treatment": "No curative chemical exists. Control psyllid vectors with approved systemic insecticides in consultation with your local horticulture officer.",
        "general_care": "Remove and destroy severely affected decline trees to prevent them acting as reservoirs for adjacent healthy trees.",
        "spread_risk": "Vector-borne via citrus psyllids and infected vegetative grafting budwood.",
    },
    "Corn___Corn Common rust": {
        "crop": "Corn",
        "disease": "Corn Common rust",
        "is_healthy": False,
        "cause": "Puccinia sorghi fungus forming cinnamon-brown powdery pustules on both upper and lower leaf surfaces.",
        "organic_treatment": "Plant rust-resistant hybrid varieties suited to your region. Practice crop rotation with non-host broadleaf crops.",
        "chemical_treatment": "Foliar fungicide application (such as azoxystrobin or propiconazole) if rust appears before tasseling on susceptible inbreds.",
        "general_care": "Avoid excessive crop density; ensure proper plant spacing for sunlight penetration.",
        "spread_risk": "Windblown urediniospores travel over very long geographic distances.",
    },
    "Corn___Corn Gray leaf spot": {
        "crop": "Corn",
        "disease": "Corn Gray leaf spot",
        "is_healthy": False,
        "cause": "Cercospora zeae-maydis fungus causing rectangular tan lesions bounded by leaf veins.",
        "organic_treatment": "Practice deep tillage or residue management to bury corn stubble. Rotate with legumes or oilseeds for at least one full year.",
        "chemical_treatment": "Strobilurin or triazole fungicides applied between VT and R2 stages if lesions progress up to the ear leaf.",
        "general_care": "Select certified hybrids with high genetic tolerance to gray leaf spot.",
        "spread_risk": "Spores splash upward from soil-borne crop debris during prolonged periods of high humidity and fog.",
    },
    "Corn___Corn Healthy": {
        "crop": "Corn",
        "disease": "Corn Healthy",
        "is_healthy": True,
        "cause": "No disease detected. Broad leaves are clear, erect, and properly pigmented.",
        "organic_treatment": "Side-dress organic compost and maintain soil moisture at silking stage.",
        "chemical_treatment": "No chemical treatment is needed.",
        "general_care": "Monitor field borders for fall armyworm and stem borer presence.",
        "spread_risk": "None.",
    },
    "Corn___Corn Northern Leaf Blight": {
        "crop": "Corn",
        "disease": "Corn Northern Leaf Blight",
        "is_healthy": False,
        "cause": "Exserohilum turcicum fungus causing large cigar-shaped grayish-green to tan lesions.",
        "organic_treatment": "Incorporate post-harvest stalks into soil. Practice a 2-year rotation with non-grass crops.",
        "chemical_treatment": "Foliar fungicide application (mancozeb, azoxystrobin) under severe disease pressure prior to reproductive stages.",
        "general_care": "Plant resistant hybrids with known Ht gene resistance.",
        "spread_risk": "Conidia are carried by wind and rain splash from infected crop residue during moderate temperatures (18-27°C).",
    },
    "Grape___Grape Black Measles": {
        "crop": "Grape",
        "disease": "Grape Black Measles (Esca)",
        "is_healthy": False,
        "cause": "Complex wood-rotting fungal pathogens (Phaeomoniella chlamydospora and Phaeoacremonium aleophilum) infecting the vascular vine system.",
        "organic_treatment": "Prune infected vines during late winter; protect major pruning wounds immediately with wound sealant or pruning paint. Sanitize shears.",
        "chemical_treatment": "No chemical spray cures systemic trunk infection. Consult a viticulture specialist for vine trunk renewal advice.",
        "general_care": "Avoid creating ragged pruning cuts. Remove and burn dead diseased vine wood from the vineyard floor.",
        "spread_risk": "Enters through pruning cuts and deep wounds during wet winter weather.",
    },
    "Grape___Grape Black rot": {
        "crop": "Grape",
        "disease": "Grape Black rot",
        "is_healthy": False,
        "cause": "Guignardia bidwellii fungus producing reddish-brown circular spots on leaves and shriveling berries into hard black mummies.",
        "organic_treatment": "Collect and destroy all shriveled mummified grape clusters from canes and ground before budbreak.",
        "chemical_treatment": "Mancozeb or myclobutanil protective spray from early shoot growth through 4 weeks post-bloom as guided by viticulture officers.",
        "general_care": "Open up canopy through shoot thinning and leaf removal around the fruiting zone to promote airflow.",
        "spread_risk": "Spores splash from overwintered mummies during warm rain.",
    },
    "Grape___Grape Healthy": {
        "crop": "Grape",
        "disease": "Grape Healthy",
        "is_healthy": True,
        "cause": "No disease detected. Grape leaves are fully formed with clean serrated margins and vibrant green color.",
        "organic_treatment": "Maintain balanced canopy training and drip irrigation.",
        "chemical_treatment": "No chemical treatment is needed.",
        "general_care": "Maintain regular canopy shoot tucking and weed control around vine trunks.",
        "spread_risk": "None.",
    },
    "Grape___Grape Isariopsis Leaf Spot": {
        "crop": "Grape",
        "disease": "Grape Isariopsis Leaf Spot",
        "is_healthy": False,
        "cause": "Phaeoisariopsis clavispora fungus causing dark brown angular leaf spots with distinct reddish borders.",
        "organic_treatment": "Remove and burn fallen infected leaves. Thin excessive vegetative shoots to reduce canopy humidity.",
        "chemical_treatment": "Copper oxychloride or carbendazim protective foliar spray as recommended by district extension staff.",
        "general_care": "Practice post-harvest nutrient supplementation to support vine vigor for the next season.",
        "spread_risk": "Spreads primarily late in the growing season under warm, humid conditions.",
    },
    "Peach___Peach Bacterial spot": {
        "crop": "Peach",
        "disease": "Peach Bacterial spot",
        "is_healthy": False,
        "cause": "Xanthomonas arboricola pv. pruni bacterium producing small water-soaked lesions that turn angular, purple, and drop out (shot-hole).",
        "organic_treatment": "Avoid sandy or wind-exposed sites without windbreaks. Avoid overhead watering.",
        "chemical_treatment": "Low-rate copper bactericide sprays during dormant and petal fall stages. Exercise caution as peach leaves are sensitive to copper injury.",
        "general_care": "Avoid excessive nitrogen fertilizers that promote lush, highly susceptible green shoots.",
        "spread_risk": "Disseminated by wind-blown rain and dew droplets during warm, stormy spring weather.",
    },
    "Peach___Peach Healthy": {
        "crop": "Peach",
        "disease": "Peach Healthy",
        "is_healthy": True,
        "cause": "No disease detected. Leaves are glossy, lanceolate, and free of shot-hole perforations.",
        "organic_treatment": "Maintain balanced organic fertilization and regular fruit thinning.",
        "chemical_treatment": "No chemical treatment is required.",
        "general_care": "Inspect lower trunk for borer frass and monitor for oriental fruit moth activity.",
        "spread_risk": "None.",
    },
    "Potato___Potato Early blight": {
        "crop": "Potato",
        "disease": "Potato Early blight",
        "is_healthy": False,
        "cause": "Alternaria solani fungus producing dark brown spots with characteristic concentric target rings on older lower leaves.",
        "organic_treatment": "Rotate crops with non-solanaceous crops for at least 3 years. Mulch soil to prevent rain splash. Prune infected lower foliage.",
        "chemical_treatment": "Mancozeb 75% WP or chlorothalonil applied preventively before row closure or upon initial spotting under extension advice.",
        "general_care": "Provide balanced potassium and nitrogen; plants under nutritional stress are more susceptible.",
        "spread_risk": "Conidia are carried by wind and splashing irrigation; disease progresses upward from lower canopy.",
    },
    "Potato___Potato Healthy": {
        "crop": "Potato",
        "disease": "Potato Healthy",
        "is_healthy": True,
        "cause": "No disease detected. Canopy is vigorous, erect, and foliage is dark green.",
        "organic_treatment": "Maintain uniform soil hilling to protect developing tubers from sunlight exposure.",
        "chemical_treatment": "No chemical treatment is required.",
        "general_care": "Maintain steady drip or furrow irrigation without waterlogging the root zone.",
        "spread_risk": "None.",
    },
    "Potato___Potato Late blight": {
        "crop": "Potato",
        "disease": "Potato Late blight",
        "is_healthy": False,
        "cause": "Phytophthora infestans water mold (oomycete) producing dark water-soaked lesions with white mold fuzz on leaf undersides in cool, humid weather.",
        "organic_treatment": "Plant only certified disease-free seed tubers. Destroy all cull piles and volunteer potatoes immediately. Do not work in wet fields.",
        "chemical_treatment": "Targeted systemic/protective oomycete fungicides (e.g. cymoxanil + mancozeb, or metalaxyl) immediately upon regional disease alert. Consult agricultural extension.",
        "general_care": "Ensure wide row spacing for canopy ventilation. Kill vines before harvest to prevent tuber infection.",
        "spread_risk": "Extremely destructive and fast-moving. Airborne sporangia travel miles in cool, cloudy, humid weather.",
    },
    "Strawberry___Strawberry Healthy": {
        "crop": "Strawberry",
        "disease": "Strawberry Healthy",
        "is_healthy": True,
        "cause": "No disease detected. Foliage is deep green, trifoliate leaves are fully intact without necrotic margins.",
        "organic_treatment": "Keep straw mulch beneath runners and maintain clean drip lines.",
        "chemical_treatment": "No chemical spray needed.",
        "general_care": "Remove old leaves after main harvest flush to encourage clean crown development.",
        "spread_risk": "None.",
    },
    "Strawberry___Strawberry Leaf scorch": {
        "crop": "Strawberry",
        "disease": "Strawberry Leaf scorch",
        "is_healthy": False,
        "cause": "Diplocarpon earlianum fungus producing numerous purplish spots that enlarge and cause entire leaf margins to brown and curl upward.",
        "organic_treatment": "Remove and destroy severely scorched foliage after harvest. Ensure wide spacing on raised plastic beds to speed leaf drying.",
        "chemical_treatment": "Captan or thiophanate-methyl protective spray applied during early leaf flush as per local horticulture guidelines.",
        "general_care": "Avoid sprinkler irrigation in the late afternoon or evening.",
        "spread_risk": "Conidia are splashed by water and rain from older infected plant crowns.",
    },
    "Tomato___Tomato Bacterial spot": {
        "crop": "Tomato",
        "disease": "Tomato Bacterial spot",
        "is_healthy": False,
        "cause": "Xanthomonas bacteria producing small water-soaked spots with dark centers and yellow halos on leaves and stems.",
        "organic_treatment": "Use hot-water treated or certified disease-free seed. Never work in wet fields. Sanitize stakes and pruning shears with disinfectant.",
        "chemical_treatment": "Copper hydroxide mixed with mancozeb applied as a protective spray every 7-10 days during warm wet weather.",
        "general_care": "Mulch beds thoroughly to stop soil and bacterial splash. Avoid overhead sprinkler watering.",
        "spread_risk": "Spreads rapidly during warm rainy weather via water splash and contaminated farm implements.",
    },
    "Tomato___Tomato Early blight": {
        "crop": "Tomato",
        "disease": "Tomato Early blight",
        "is_healthy": False,
        "cause": "Alternaria solani fungus producing brown/black circular lesions with concentric target rings on older lower leaves.",
        "organic_treatment": "Mulch soil with straw or plastic to prevent splash. Prune lower leaves up to 30 cm from ground. Spray neem oil or fermented buttermilk extract.",
        "chemical_treatment": "Mancozeb 75% WP or copper oxychloride protective foliar spray as recommended by your local extension officer. Follow product label.",
        "general_care": "Stake plants upright for maximum airflow. Water strictly at the base through drip hoses.",
        "spread_risk": "Spreads upward through rain splash and windblown spores, especially after morning dew.",
    },
    "Tomato___Tomato Healthy": {
        "crop": "Tomato",
        "disease": "Tomato Healthy",
        "is_healthy": True,
        "cause": "No disease detected. Tomato foliage is vigorous, dark green, and free of necrotic lesions or mottling.",
        "organic_treatment": "Maintain regular organic compost mulching, balanced drip fertigation, and routine pruning of suckers.",
        "chemical_treatment": "No chemical treatment is required. Protect natural predator insects in your field.",
        "general_care": "Stake plants properly, irrigate uniformly to prevent blossom end rot, and monitor lower leaves weekly.",
        "spread_risk": "None.",
    },
    "Tomato___Tomato Late blight": {
        "crop": "Tomato",
        "disease": "Tomato Late blight",
        "is_healthy": False,
        "cause": "Phytophthora infestans oomycete causing large water-soaked dark lesions that rapidly turn brown and greasy, with white fungal growth underneath.",
        "organic_treatment": "Remove and bag infected plants immediately on a dry day; do not add to compost. Increase plant spacing to maximize air drying.",
        "chemical_treatment": "Targeted protective/systemic fungicides (e.g. cymoxanil, metalaxyl-M, or dimethomorph) applied upon regional warning before widespread infection.",
        "general_care": "Avoid planting tomatoes adjacent to potato fields. Water early in the morning so foliage dries before nightfall.",
        "spread_risk": "Extremely aggressive. Windblown sporangia can devastate entire plantings within 7 to 10 days in cool humid weather.",
    },
    "Tomato___Tomato Leaf Mold": {
        "crop": "Tomato",
        "disease": "Tomato Leaf Mold",
        "is_healthy": False,
        "cause": "Passalora fulva fungus producing pale yellow spots on upper leaf surfaces and olive-green velvety mold on the corresponding underside.",
        "organic_treatment": "Increase greenhouse/polytunnel ventilation to keep relative humidity below 85%. Prune lower dense foliage.",
        "chemical_treatment": "Copper-based or chlorothalonil protectant sprays applied thoroughly to leaf undersides under departmental guidance.",
        "general_care": "Ensure high air circulation and avoid crowding plants in protected polyhouses.",
        "spread_risk": "High risk in enclosed greenhouses and polyhouses with high humidity (above 85%).",
    },
    "Tomato___Tomato Mosaic virus": {
        "crop": "Tomato",
        "disease": "Tomato Mosaic virus (ToMV)",
        "is_healthy": False,
        "cause": "Tobamovirus causing light and dark green mosaic mottling, distorted strap-like leaves, and stunted growth.",
        "organic_treatment": "Immediately pull out and burn infected plants. Wash hands thoroughly with soap and water before handling plants. Sanitize tools in 20% nonfat dry milk or bleach.",
        "chemical_treatment": "No chemical treatment cures viral infections. Never apply fungicides or bactericides for viral disease.",
        "general_care": "Control weed hosts (nightshades) around field borders. Do not smoke or handle tobacco products near tomato crops.",
        "spread_risk": "Extremely stable virus spread mechanically by hands, clothing, pruners, and contaminated tools.",
    },
    "Tomato___Tomato Septoria leaf spot": {
        "crop": "Tomato",
        "disease": "Tomato Septoria leaf spot",
        "is_healthy": False,
        "cause": "Septoria lycopersici fungus causing numerous tiny circular spots with gray centers and dark brown borders, often with tiny black specks.",
        "organic_treatment": "Prune infected bottom leaves. Apply clean mulch to cover bare soil. Water solely through drip irrigation.",
        "chemical_treatment": "Chlorothalonil or copper-based protective fungicide applied every 7-10 days during warm wet periods as advised by crop officers.",
        "general_care": "Practice 2-year rotation away from solanaceous crops. Deeply bury or remove crop debris after final harvest.",
        "spread_risk": "Splashes upward from soil and lower leaves during heavy rainstorms.",
    },
    "Tomato___Tomato Spider mites": {
        "crop": "Tomato",
        "disease": "Tomato Spider mites (Two-spotted spider mites)",
        "is_healthy": False,
        "cause": "Tetranychus urticae arachnids feeding on leaf undersides, causing fine yellow stippling, bronzing, and delicate silk webbing.",
        "organic_treatment": "Spray neem oil (5 ml/L) or insecticidal soap thoroughly covering leaf undersides. Wash foliage with a strong stream of water to dislodge colonies.",
        "chemical_treatment": "Specific miticide (e.g. abamectin, spiromesifen) if infestation exceeds threshold, rotated to prevent resistance. Consult agriculture officer.",
        "general_care": "Keep field roadways and borders moist to reduce airborne dust, which encourages mite buildup.",
        "spread_risk": "Mites multiply extremely rapidly during hot, dry, dusty weather.",
    },
    "Tomato___Tomato Target Spot": {
        "crop": "Tomato",
        "disease": "Tomato Target Spot",
        "is_healthy": False,
        "cause": "Corynespora cassiicola fungus causing brown lesions with pale centers and faint concentric rings on leaves and stems.",
        "organic_treatment": "Improve field drainage. Increase row spacing and prune lower suckers to maximize airflow through the canopy.",
        "chemical_treatment": "Azoxystrobin or protective chlorothalonil spray applied as per regional pest management advisory.",
        "general_care": "Remove weeds and solanaceous volunteers. Discard old crop residues promptly.",
        "spread_risk": "Fungal spores are dispersed by wind and overhead water splash in warm, humid weather.",
    },
    "Tomato___Tomato Yellow Leaf Curl Virus": {
        "crop": "Tomato",
        "disease": "Tomato Yellow Leaf Curl Virus (TYLCV)",
        "is_healthy": False,
        "cause": "Begomovirus transmitted exclusively by the silverleaf whitefly (Bemisia tabaci). Causes severe leaf curling, yellowing margins, and stunting.",
        "organic_treatment": "Install yellow sticky traps (15-20 per acre) to monitor and trap whiteflies. Protect nursery beds with 40-50 mesh insect-proof netting. Rogue infected plants.",
        "chemical_treatment": "No cure for the virus itself. Focus strictly on whitefly vector control (neem formulations or approved systemic insecticides) under local extension direction.",
        "general_care": "Select TYLCV-resistant tomato hybrids for planting in whitefly-prone endemic regions.",
        "spread_risk": "Transmitted by whiteflies within 15-30 minutes of feeding on infected plants.",
    },
}


def get_advisory_for_class(predicted_class: str) -> Dict[str, Any]:
    """Retrieve full agronomic advisory for a predicted class.
    
    Falls back gracefully if the predicted class is unknown or formatted unusually.
    """
    if predicted_class in DISEASE_KNOWLEDGE_BASE:
        return DISEASE_KNOWLEDGE_BASE[predicted_class]

    # Handle split parsing if composite label
    crop = "Unknown"
    disease = predicted_class
    if "___" in predicted_class:
        parts = predicted_class.split("___", 1)
        crop = parts[0].strip()
        disease = parts[1].strip()

    is_healthy = "healthy" in disease.lower()

    return {
        "crop": crop,
        "disease": disease,
        "is_healthy": is_healthy,
        "cause": "Specific cause information for this visual pattern is being verified by agronomic specialists.",
        "organic_treatment": (
            "Maintain balanced watering, prune yellowing or damaged foliage with sanitized shears, and ensure good airflow."
            if not is_healthy
            else "Maintain regular crop monitoring, balanced organic fertilization, and routine irrigation."
        ),
        "chemical_treatment": (
            "Consult your local Krishi Vigyan Kendra (KVK) or district agricultural extension officer with a physical sample before applying chemical sprays."
            if not is_healthy
            else "No chemical treatment required."
        ),
        "general_care": "Isolate damaged plant parts, sanitize tools between plants, and inspect surrounding crop rows regularly.",
        "spread_risk": "Observe surrounding plants for similar symptoms and avoid overhead watering until diagnosed.",
    }


def assess_confidence(confidence: float) -> Dict[str, str]:
    """Provide farmer-friendly assessment of model prediction confidence."""
    if confidence >= 0.70:
        return {
            "level": "high",
            "label": "High Confidence",
            "note": "The AI visual model shows strong pattern match for this condition.",
        }
    elif confidence >= 0.45:
        return {
            "level": "moderate",
            "label": "Moderate Confidence",
            "note": "The pattern match is moderate. Review symptoms carefully or take a closer photo in daylight.",
        }
    else:
        return {
            "level": "low",
            "label": "Low Confidence / Uncertain",
            "note": "The model is uncertain about this image. We recommend taking a clearer photo in daylight or consulting your local agricultural extension officer.",
        }
