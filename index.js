'use strict';

/**
 * This sample demonstrates an implementation of the Lex Code Hook Interface
 * in order to serve a sample bot which manages orders for flowers.
 * Bot, Intent, and Slot models which are compatible with this sample can be found in the Lex Console
 * as part of the 'OrderFlowers' template.
 *
 * For instructions on how to set up and test this bot, as well as additional samples,
 *  visit the Lex Getting Started documentation.
 */

const request = require('request');
const cheerio = require('cheerio');

// --------------- Helpers to build responses which match the structure of the necessary dialog actions -----------------------

function elicitSlot(sessionAttributes, intentName, slots, slotToElicit, message) {
    return {
        sessionAttributes,
        dialogAction: {
            type: 'ElicitSlot',
            intentName,
            slots,
            slotToElicit,
            message
        }
    };
}

function close(sessionAttributes, fulfillmentState, message) {
    return {
        sessionAttributes,
        dialogAction: {
            type: 'Close',
            fulfillmentState,
            message
        }
    };
}

function delegate(sessionAttributes, slots) {
    return {
        sessionAttributes,
        dialogAction: {
            type: 'Delegate',
            slots
        }
    };
}

// ---------------- Helper Functions --------------------------------------------------

function parseLocalDate(date) {
    /**
     * Construct a date object in the local timezone by parsing the input date string, assuming a YYYY-MM-DD format.
     * Note that the Date(dateString) constructor is explicitly avoided as it may implicitly assume a UTC timezone.
     */
    const dateComponents = date.split(/\-/);
    return new Date(dateComponents[0], dateComponents[1] - 1, dateComponents[2]);
}

function isValidDate(date) {
    try {
        return !(isNaN(parseLocalDate(date).getTime()));
    } catch (err) {
        return false;
    }
}

function buildValidationResult(isValid, violatedSlot, messageContent) {
    if (messageContent == null) {
        return {
            isValid,
            violatedSlot
        };
    }
    return {
        isValid,
        violatedSlot,
        message: { contentType: 'PlainText', content: messageContent }
    };
}

function validateSuggestDinner(mainIngredient, recipeLibrary) {
    const libraries = ['fine']; //TODO because it is so difficult to pronounce tine
    const mainIngredients = ['meat', 'fish', 'plants'];
    if (recipeLibrary && libraries.indexOf(recipeLibrary.toLowerCase()) === -1) {
        return buildValidationResult(false, 'RecipeLibrary', `We do not support recipes from ${recipeLibrary}. At the moment we only support Tine.`);
    }

    if (mainIngredient && mainIngredients.indexOf(mainIngredient.toLowerCase()) === -1) {
        return buildValidationResult(false, 'MainIngredient', `I don't know about ${mainIngredient}. Try something else, for example fish.`);
    }
    return buildValidationResult(true, null, null);
}

// --------------- Functions that control the bot's behavior -----------------------

function suggestDinner(intentRequest, callback) {
    const mainIngredient = intentRequest.currentIntent.slots.MainIngredient;
    const recipeLibrary = intentRequest.currentIntent.slots.RecipeLibrary;
    const source = intentRequest.invocationSource;

    if (source === 'DialogCodeHook') {
        // Perform basic validation on the supplied input slots.  Use the elicitSlot dialog action to re-prompt for the first violation detected.
        const slots = intentRequest.currentIntent.slots;
        const validationResult = validateSuggestDinner(mainIngredient, recipeLibrary);
        if (!validationResult.isValid) {
            slots[`${validationResult.violatedSlot}`] = null;
            callback(elicitSlot(intentRequest.sessionAttributes, intentRequest.currentIntent.name, slots, validationResult.violatedSlot, validationResult.message));
            return;
        }

        const outputSessionAttributes = intentRequest.sessionAttributes || {};
        callback(delegate(outputSessionAttributes, intentRequest.currentIntent.slots));
        return;
    }

    suggestDinnerFunc(mainIngredient, recipeLibrary, intentRequest, callback);
}

function suggestDinnerFunc(mainIngredient, recipeLibrary, intentRequest, callback){
    // Try to find a dinner based on the recipe library and the main ingredient
    const url = 'https://www.tine.no/oppskrifter/sok/oppskrifter?q=' + mainIngredient;
    console.log(`querying: ${url}`);
    request(url, function(error, response, html){

        const json = {};

        if (!error){
            const $ = cheerio.load(html);
            const suggestedDinners = [];
            $('.m-recipe-card').filter(function(){
                var data = $(this);

                const anchorElement = data.children('a').first();
                const link = anchorElement.attr('href');
                console.log(`link: ${link}`);

                const cardTitleElement = $('.a-card-title', this).first();
                const title = cardTitleElement.children().first().text();
                console.log(`title: ${title}`);

                const cardDurationElement = $('.m-cook-time', this).first();
                const cookDuration = cardDurationElement.text();
                console.log(`cookDuration: ${cookDuration}`);
                console.log('');

                suggestedDinners.push({
                    title,
                    link,
                    cookDuration
                });
            });
            console.log(`Found ${suggestedDinners.length} dinners`);
            if (suggestedDinners.length > 0){
                callback(close(intentRequest.sessionAttributes, 'Fulfilled',
                    { contentType: 'PlainText', content: `I could not find any dinners, sorry!` }));
            }
            else {
                const firstDinner = suggestedDinners.first();
                callback(close(intentRequest.sessionAttributes, 'Fulfilled',
                    { contentType: 'PlainText', content:
                        `Thanks, ${recipeLibrary} suggests that you make ${firstDinner.title}.
                        It takes ${firstDinner.cookDuration} to cook.
                        Link to recipe: ${firstDinner.link}` }));
            }
        }
        else {
            console.warn(`Problem with the request to ${url}: ${error}`);
            callback(close(intentRequest.sessionAttributes, 'Fulfilled',
                { contentType: 'PlainText', content:
                    `I encountered some technical issues when talking to the recipe library,
                    so I can't help you now. Sorry!` }));
        }
    });
}

// --------------- Intents -----------------------

/**
 * Called when the user specifies an intent for this skill.
 */
function dispatch(intentRequest, callback) {
    console.log(`dispatch userId=${intentRequest.userId}, intentName=${intentRequest.currentIntent.name}`);

    const intentName = intentRequest.currentIntent.name;

    // Dispatch to your skill's intent handlers
    if (intentName === 'Suggest_dinner') {
        return suggestDinner(intentRequest, callback);
    }
    throw new Error(`Intent with name ${intentName} not supported`);
}

// --------------- Main handler -----------------------

// Route the incoming request based on intent.
// The JSON body of the request is provided in the event slot.
exports.handler = (event, context, callback) => {
    try {
        // By default, treat the user request as coming from the America/New_York time zone.
        process.env.TZ = 'America/New_York';
        console.log(`event.bot.name=${event.bot.name}`);

        if (event.bot.name !== 'SuggestDinner') {
            callback('Invalid Bot Name');
        }
        dispatch(event, (response) => callback(null, response));
    } catch (err) {
        callback(err);
    }
};

suggestDinnerFunc('fisk',undefined);