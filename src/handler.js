"use strict";

// configuration
const MAILGUN_KEY = "key-...";
const SLACKHOOK_URL = "https://hooks.slack.com/services/...";

var superagent = require("superagent");
var mockreq = require("mock-req");
var multiparty = require("multiparty");
const crypto = require("crypto");
const hmac = crypto.createHmac("sha256", MAILGUN_KEY);

module.exports.slackPost = (event, context, cb) => {
  try {
    if (event.body.hasOwnProperty("From")) { // x-www-form-urlencoded was parsed
      processMessage(
        event.body.timestamp,
        event.body.token,
        event.body.signature, 
        event.body.recipient, 
        event.body.From,
        event.body.Subject,
        event.body["body-plain"],
        cb
      );
    }
    else { 
      // need to parse multipart/mixed 
      // mock an http request 
      var req = new mockreq({method: "POST", url: "/", headers: event.headers});
      req.write(event.body);
      req.end();

      // parse the multipart/mixed form data
      var form = new multiparty.Form();
      form.parse(req, function(err,fields,files) {
        processMessage(
          fields["timestamp"][0],
          fields["token"][0],
          fields["signature"][0],
          fields["recipient"][0], 
          fields["from"][0], 
          fields["Subject"][0], 
          fields["body-plain"][0], 
          cb);
      }); 
    }
  } catch (error) {
    // post error alert to slack
    superagent.post(SLACKHOOK_URL)
      .send({
          "text": "Serverless Mailgun Error: " + error,
          "icon_emoji": ":incoming_envelope:",
          "username": "mailbot",
          "channel": "#general"
        })
      .end(function(err,res) {
        // return error 
        cb(null, { error: error });
      });
  }
};

function processMessage(timestamp, token, signature, recipient, from, subject, body, cb) {
  console.log("verifying sig...");
  // verify signature
  hmac.update(timestamp + token);
  if (hmac.digest("hex") != signature) {
    console.error("invalid signature");
    cb(null, { error: "invalid signature"});
  }
  else {
    console.log("verified.");
    // find channel
    var channel = recipient.match(/(\w*)\+([^@]*)@.*/i)[2];

    console.log("channel: #" + channel);
    // slack payload 
    var json = { 
        "attachments": [{ 
          "fallback": "Email from " + from + ", Subject: " + subject,
          "author_name": from,
          "title": subject,
          "fields": [{
            "value": body
          }]
        }],
        "icon_emoji": ":incoming_envelope:",
        "username": "mailbot",
        "channel": "#" + channel
      };

    console.log("payload: " + json);
    // post update to slack
    superagent.post(SLACKHOOK_URL)
      .send(json)
      .end(function(err,res) {
        // return OK to client
        cb(null, { message: res.text });
      });
  }
}

// You can add more handlers here, and reference them in serverless.yml
