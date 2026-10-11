# AgriConnect AI — Model Training (Phase 14)

This directory is reserved for training pipelines, dataset preprocessing scripts, and evaluation benchmarks planned for **Phase 14**.

## Scope for Phase 14

During Phase 14, the following training workflows will be introduced:
1. **Crop Recommendation**:
   - Algorithm: Random Forest / XGBoost / LightGBM
   - Input Features: Nitrogen (N), Phosphorus (P), Potassium (K), Temperature, Humidity, Soil pH, Rainfall
   - Target: Recommended crop class
   - Serialization: `models/crop_recommendation_model.joblib`

2. **Price Prediction**:
   - Algorithm: Gradient Boosting / XGBoost / Random Forest Regressor
   - Input Features: Crop, Market, Location/State, Season/Month, Historical price trends
   - Target: Estimated market price (INR/quintal or kg)
   - Serialization: `models/price_prediction_model.joblib`

3. **Demand Forecasting**:
   - Algorithm: Time-series / Regression (Prophet, XGBoost, or Random Forest)
   - Input Features: Crop, Region, Season, Historic transaction volumes
   - Target: Expected demand volume / index
   - Serialization: `models/demand_prediction_model.joblib`

4. **Crop Disease Detection**:
   - Architecture: YOLO / Transfer Learning CNN (MobileNetV3 / ResNet)
   - Input: Preprocessed leaf image (224x224 or 640x640)
   - Target: Disease classification & confidence score
   - Serialization: `models/disease_detection_model.pt` or ONNX

## Policies & Guidelines
- No mock or synthetic binary models are to be created in the repository.
- Raw datasets are stored locally in `datasets/<task>/` and ignored by Git.
- Exported model artifacts are stored in `models/` and ignored by Git.
- Training scripts must log evaluation metrics (Accuracy, F1-Score, RMSE, MAE) and export model metadata alongside weights.
