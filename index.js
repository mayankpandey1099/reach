require("dotenv").config();
const express = require("express");
const session = require("express-session");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const app = express();
const { Client } = require("@microsoft/microsoft-graph-client");
const {
  PublicClientApplication,
  ConfidentialClientApplication,
} = require("@azure/msal-node");

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: "aJYMmtuinLmRXx0NZYx4",
    resave: false,
    saveUninitialized: false,
  })
);

let port = process.env.PORT || 3000;

const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const tenantId = process.env.TENANT_ID;
const redirectUri = "http://localhost:3000"; //or any redirect uri you set on the azure AD

const scopes = ["https://graph.microsoft.com/.default"];

const msalConfig = {
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    redirectUri,
  },
};

const pca = new PublicClientApplication(msalConfig);

const ccaConfig = {
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    clientSecret,
  },
};

const cca = new ConfidentialClientApplication(ccaConfig);

app.get("/signin", (req, res) => {
  const authCodeUrlParameters = {
    scopes,
    redirectUri,
  };

  pca.getAuthCodeUrl(authCodeUrlParameters).then((response) => {
    res.redirect(response);
  }).catch(error => {
    console.log(error);
    res.status(500).send(error);
  });
});

let useraccessToken;
let clientaccessToken; 

app.get("/", (req, res) => {
  const tokenRequest = {
    code: req.query.code,
    scopes,
    redirectUri,
    clientSecret,
    authority: `https://login.microsoftonline.com/${tenantId}`,
  };

  cca
    .acquireTokenByCode(tokenRequest)
    .then((response) => {
      // Store the user-specific access token in the session for future use
      req.session.accessToken = response.accessToken;
      useraccessToken = response.accessToken;
      // Redirect the user to a profile page or any other secure route
      // This time, we are redirecting to the get-access-token route to generate a client token
      res.redirect("/get-access-token");
    })
    .catch((error) => {
      console.log(error);
      res.status(500).send(error);
    });
});

app.get("/get-access-token", async (req, res) => {
  try {
    const tokenRequest = {
      scopes,
      clientSecret,
      authority: `https://login.microsoftonline.com/${tenantId}`
    };

    const response = await cca.acquireTokenByClientCredential(tokenRequest);

    // Store the client-specific access token in the session for future use
    req.session.clientAccessToken = response.accessToken; // This will now be stored in the session
    clientaccessToken = response.accessToken;
    res.send("Access token acquired successfully!");
  } catch (error) {
    res.status(500).send(error);
    console.log("Error acquiring access token:", error.message);
  }
});

console.log(clientaccessToken, useraccessToken);

app.get("/get-mails", async (req, res) => {
  try {
    //console.log(clientaccessToken, useraccessToken);
    const userAccessToken = useraccessToken;
    const clientAccessToken = clientaccessToken;

    if (!userAccessToken) {
      return res
        .status(401)
        .send("User not authenticated. Please sign in first.");
    }

    if (!clientAccessToken) {
      return res
        .status(401)
        .send(
          "Client not authenticated. Please acquire the client access token first."
        );
    }
    const client = Client.init({
      authProvider: (done) => {
        done(null, userAccessToken);
      },
    });
    const messages = await client.api("https://graph.microsoft.com/v1.0/me/messages").get();
    res.send(messages);
  } catch (error) {
    res.status(500).send(error);
    console.log("Error fetching messages:", error.message);
  }
});

app.use("/send-mail/:recipient", async (req, res) => {
  const recipient = req.params.recipient;

  try {
    // Retrieve the user and client access tokens from the session
    const userAccessToken = req.session.accessToken;
    const clientAccessToken = req.session.clientAccessToken;

    // Check if the user and client are authenticated
    if (!userAccessToken) {
      return res
        .status(401)
        .send("User not authenticated. Please sign in first.");
    }

    if (!clientAccessToken) {
      return res
        .status(401)
        .send(
          "Client not authenticated. Please acquire the client access token first."
        );
    }

    // Initialize the Microsoft Graph API client using the user access token
    const client = Client.init({
      authProvider: (done) => {
        done(null, userAccessToken);
      },
    });

    // Prepare the email data
    const sendMail = {
      message: {
        subject: "Wanna go out for lunch?",
        body: {
          contentType: "Text",
          content: "I know a sweet spot that just opened around us!",
        },
        toRecipients: [
          {
            emailAddress: {
              address: recipient,
            },
          },
        ],
      },
      saveToSentItems: false,
    };

    // Send the email using the Microsoft Graph API
    const response = await client.api("/me/sendMail").post(sendMail);
    res.send(response);
  } catch (error) {
    res.status(500).send(error);
    console.log("Error sending message:", error.message);
  }
});

app.listen(port, () => {
  console.log(`app listening on port ${port}`);
});
