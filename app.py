from flask import Flask, request, jsonify
from flask_cors import CORS
from run_fico_pipeline import predict_fico, credit_to_interest_and_loan

app = Flask(__name__)
CORS(app)

@app.route("/api/fico-score", methods=["POST"])
def fico_score():
    data = request.get_json()
    wallet = data.get("wallet_address")
    chain = data.get("chain", "ethereum").lower()

    if not wallet:
        return jsonify({"message": "Missing wallet_address"}), 400

    try:
        score = predict_fico(wallet, chain=chain)
        interest, amount = credit_to_interest_and_loan(score)
        if score < 60:
            interest = None
            amount = 0
        return jsonify({
            "fico_score": round(score, 2),
            "interest_rate": interest,
            "max_loan_amount": amount
        })
    except Exception as e:
        return jsonify({"message": str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True)
