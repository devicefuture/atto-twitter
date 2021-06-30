const app = require("express")();
const open = require("open");
const Twit = require("twit");

const URL_BASE = "https://jamesl.me/atto";
const TWITTER_USERNAME = "codeurdreams";

var T = new Twit({}); // TODO: Add config data from environment variables
var stream = T.stream("user");

var requestQueue = [];

class Request {
    constructor(code, originStatusId) {
        this.code = code;
        this.originStatusId = originStatusId;

        this.reply = "";
        this.running = false;
        this.fulfilled = false;

        this.runCode();
    }

    runCode() {
        this.running = true;

        var url = `${URL_BASE}?code=${encodeURIComponent(this.code)}`;

        open(url);

        this.reply = `Run and edit live at: ${url}`;
    }

    fulfil() {
        T.post("statuses/update", {status: this.reply, in_reply_to_status_id: this.originStatusId});

        this.running = false;
        this.fulfilled = true;
    }
}

function tweetRequestEvent(tweet) {
    if (!(tweet.in_reply_to_screen_name == TWITTER_USERNAME || tweet.text.includes("@" + TWITTER_USERNAME + " "))) {
        return;
    }

    requestQueue = requestQueue.filter((i) => !i.fulfilled);

    requestQueue.push(new Request(tweet.text.replace("@" + TWITTER_USERNAME + " ", ""), tweet.id_str));
}

app.post("/fulfil/:id", function(req, res) {
    for (var i = 0; i < requestQueue.length; i++) {
        if (requestQueue[i].originStatusId == req.params.id) {
            requestQueue[i].fulfil(); // TODO: Send data to handle fulfilment

            res.status(200);

            return;
        }
    }

    res.status(404);
});

app.listen("3000", function() {
    console.log("Listening at localhost:3000");

    stream.on("tweet", tweetRequestEvent);

    new Request(`10 print "Hello, world!"\n20 goto 10`);
});