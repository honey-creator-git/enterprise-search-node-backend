const jwt = require("jsonwebtoken");
const axios = require("axios");

// Middleware to validate tokens issued by Keycloak
const setRoleMiddleware = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  if (!authHeader) return res.status(401).send("Authorization header missing");

  const token = authHeader.split(" ")[1];
  if (!token) return res.status(401).send("Token missing");

  try {
    // Decode token without validation to extract `kid` and `iss`
    const decodedToken = jwt.decode(token, { complete: true });
    if (!decodedToken) return res.status(401).send("Invalid token");

    const { kid } = decodedToken.header;
    const { iss } = decodedToken.payload;

    if (!iss) return res.status(400).send("Token issuer (iss) missing");

    // Fetch JWKS URI from Keycloak's discovery document
    const openIdConfigUrl = `${iss}/.well-known/openid-configuration`;
    const { data: openIdConfig } = await axios.get(openIdConfigUrl);
    const jwksUri = openIdConfig.jwks_uri;

    // Fetch the JWKS keys
    const { data: jwks } = await axios.get(jwksUri);

    // Find the signing key by `kid`
    const signingKey = jwks.keys.find((key) => key.kid === kid);
    if (!signingKey) return res.status(401).send("Signing key not found");

    // Convert the public key to PEM format
    const publicKey = `-----BEGIN CERTIFICATE-----\n${signingKey.x5c[0]}\n-----END CERTIFICATE-----`;

    // Validate the token with the public key
    jwt.verify(token, publicKey, { algorithms: ["RS256"] }, (err, verifiedToken) => {
      if (err) {
        console.error("Token validation failed:", err);
        return res.status(401).send("Invalid token");
      }

      // Set user properties from the verified token
      req.userId = verifiedToken.uoid || null;
      req.coid = verifiedToken.coid || null;
      req.name = verifiedToken.name || "Unknown";
      req.email = verifiedToken.email || "Unknown";
      req.groups = (verifiedToken.groups || []).join(", ");
      req.permissions = (verifiedToken.permissions || []).join(", ");

      // Assign role and permission based on claims
      req.userRole = (verifiedToken.groups || []).includes("Admin") ? "Admin" : "Viewer";
      req.userPermission = (verifiedToken.permissions || []).includes("ESS") ? "ESS" : "";

      // Proceed to the next middleware
      next();
    });
  } catch (error) {
    console.error("Error validating token:", error);
    res.status(500).send("Internal server error");
  }
};

module.exports = setRoleMiddleware;