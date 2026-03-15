const { onRequest } = require("firebase-functions/v2/https");
const { GoogleGenAI } = require("@google/genai");

// Define a simple Cloud Function endpoint
exports.getTrivia = onRequest({ invoker: "public", cors: true, secrets: ["MAPS_API_KEY", "GEMINI_API_KEY"] }, async (req, res) => {
    // Only allow POST requests for security
    if (req.method !== 'POST') {
        res.status(405).send({ error: 'Method Not Allowed' });
        return;
    }

    try {
        const { lat, lng } = req.body;

        if (!lat || !lng) {
            res.status(400).send({ error: 'Body must contain lat and lng.' });
            return;
        }

        const mapsKey = process.env.MAPS_API_KEY;
        if (!mapsKey) {
            res.status(500).send({ error: "Missing MAPS_API_KEY secret." });
            return;
        }

        // 1. Fetch nearby places from Google Maps API
        const payload = {
            includedTypes: ["tourist_attraction", "museum", "historical_landmark", "park", "church"],
            maxResultCount: 15,
            locationRestriction: {
                circle: {
                    center: { latitude: lat, longitude: lng },
                    radius: 2000.0 // 2km radius
                }
            }
        };

        const mapsRes = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': mapsKey,
                'X-Goog-FieldMask': 'places.displayName,places.primaryType,places.shortFormattedAddress',
                'Referer': 'https://geo-trivia-pocaricky.web.app/'
            },
            body: JSON.stringify(payload)
        });

        if (!mapsRes.ok) {
            console.error(await mapsRes.text());
            res.status(500).send({ error: "Failed to fetch locations from Maps API." });
            return;
        }

        const data = await mapsRes.json();
        
        if (!data.places || data.places.length === 0) {
            res.status(404).send({ error: "No interesting places found nearby." });
            return;
        }

        // Extract location name from the first found place 
        let locationName = "Current Location";
        if (data.places[0] && data.places[0].shortFormattedAddress) {
            // "shortFormattedAddress" often looks like "Neighborhood, City"
            locationName = data.places[0].shortFormattedAddress.split(',').pop().trim();
        }

        // Pick 5 random places
        const places = data.places.sort(() => 0.5 - Math.random()).slice(0, 5);

        // 2. Initialize the Gemini SDK.
        const ai = new GoogleGenAI({});

        // Batch the prompt to avoid Rate Limit on the Free Tier!
        const placesContext = places.map((place, index) => {
            const placeName = place.displayName?.text || place.placeName;
            const placeType = (place.primaryType || place.placeType || 'place').replace(/_/g, ' ');
            return `${index + 1}. Place: "${placeName}" (${placeType})`;
        }).join('\n');

        const prompt = `You are a trivia expert. Given the following list of places, provide exactly one short (max 2 sentences), fascinating, unexpected, and conversation-starting trivia fact for EACH place. Do NOT give historical summaries or generic descriptions. Be weird or highly interesting.\n\nReturn EXACTLY a raw JSON array of strings, where each string is the fact for the corresponding place in the exact same order. Do NOT include markdown blocks like \`\`\`json.\n\nPlaces:\n${placesContext}`;

        let factsArray = [];
        try {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
            });
            const text = response.text.trim();
            // Attempt to parse the JSON array response (stripping markdown if present)
            const cleanText = text.replace(/^```json/i, '').replace(/```$/, '').trim();
            factsArray = JSON.parse(cleanText);
            
            if (!Array.isArray(factsArray) || factsArray.length !== places.length) {
                console.warn("Invalid array returned from Gemini:", factsArray);
                factsArray = places.map(() => "No trivia generated.");
            }
        } catch (err) {
            console.error(`Gemini Batch Error:`, err);
            factsArray = places.map(() => "Hmm, Gemini had trouble with this one.");
        }

        const results = places.map((place, index) => {
            const placeName = place.displayName?.text || place.placeName;
            const placeType = (place.primaryType || place.placeType || 'place').replace(/_/g, ' ');
            return { placeName, placeType, fact: factsArray[index] || "No trivia available." };
        });

        res.status(200).send({ data: results, location: { lat, lng, name: locationName } });

    } catch (error) {
        console.error("Critical Function Error:", error);
        res.status(500).send({ error: 'Internal Server Error while fetching trivia.' });
    }
});
