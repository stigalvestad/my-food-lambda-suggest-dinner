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
const urlencode = require('urlencode');

const FISH = 'fish';
const MEAT = 'meat';
const VEGETARIAN = 'vegetarian';

const LIBRARY_MENY = 'mini'; //TODO because it is so difficult to pronounce meny in english
const LIBRARY_TINE = 'fine'; //TODO because it is so difficult to pronounce tine in english

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
    const libraries = [LIBRARY_TINE, LIBRARY_MENY];
    const mainIngredients = [MEAT, FISH, VEGETARIAN];
    if (recipeLibrary && libraries.indexOf(recipeLibrary.toLowerCase()) === -1) {
        return buildValidationResult(false, 'RecipeLibrary',
            `We do not support recipes from ${recipeLibrary}.
            At the moment we support ${LIBRARY_TINE} and ${LIBRARY_MENY}.`);
    }

    if (mainIngredient && mainIngredients.indexOf(mainIngredient.toLowerCase()) === -1) {
        return buildValidationResult(false, 'MainIngredient',
            `I don't know about ${mainIngredient}. Try something else, for example fish.`);
    }
    return buildValidationResult(true, null, null);
}

// --------------- Functions that control the bot's behavior -----------------------

function suggestDinner(intentRequest, callback) {
    const mainIngredient = intentRequest.currentIntent.slots.MainIngredient;
    const recipeLibrary = intentRequest.currentIntent.slots.RecipeLibrary;
    const source = intentRequest.invocationSource;

    if (source === 'DialogCodeHook') {
        // Perform basic validation on the supplied input slots.
        // Use the elicitSlot dialog action to re-prompt for the first violation detected.
        const slots = intentRequest.currentIntent.slots;
        const validationResult = validateSuggestDinner(mainIngredient, recipeLibrary);
        if (!validationResult.isValid) {
            slots[`${validationResult.violatedSlot}`] = null;
            callback(elicitSlot(intentRequest.sessionAttributes, intentRequest.currentIntent.name,
                slots, validationResult.violatedSlot, validationResult.message));
            return;
        }

        const outputSessionAttributes = intentRequest.sessionAttributes || {};
        callback(delegate(outputSessionAttributes, intentRequest.currentIntent.slots));
        return;
    }

    suggestDinnerFunc(mainIngredient, recipeLibrary.toLowerCase(), intentRequest, callback);
}

function buildUrl(mainIngredient, recipeLibrary){
    const translatedMainIngredient = translateMainIngredient(mainIngredient);
    switch (recipeLibrary) {
        case LIBRARY_TINE:
            return `https://www.tine.no/oppskrifter/sok/oppskrifter?q=${urlencode(translatedMainIngredient)}`;
        case LIBRARY_MENY:
            return `https://meny.no/oppskrifter/oppskriftssok/?q=${urlencode(translatedMainIngredient)}`;
        default:
            throw new Error(`Recipe library ${recipeLibrary} is not supported`);
    }
}

function suggestDinnerFunc(mainIngredient, recipeLibrary, intentRequest, callback){
    // Try to find a dinner based on the recipe library and the main ingredient
    const url = buildUrl(mainIngredient, recipeLibrary);
    console.log(`querying: ${url}`);
    request(url, function(error, response, html){

        if (!error){
            const $ = cheerio.load(html);
            const suggestedDinners = [];

            if (recipeLibrary === LIBRARY_TINE) {
                $('.m-recipe-card').filter(function(){
                    const data = $(this);

                    const anchorElement = data.children('a').first();
                    const link = 'https://www.tine.no' + anchorElement.attr('href');
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
            }
            else if (recipeLibrary === LIBRARY_MENY){
                $('a.c-recipe-li').filter(function(){
                    const data = $(this);

                    const link = 'https://meny.no' + data.attr('href');
                    console.log(`link: ${link}`);

                    const cardTitleElement = $('.c-recipe-li__title', this).first();
                    const title = cardTitleElement.text();
                    console.log(`title: ${title}`);

                    const cardDurationElement = $('.c-recipe-li__meta', this).filter(function(){
                        return $('i', this).hasClass('c-recipe-li__icon-time');
                    }).first();
                    const cookDuration = $('.c-recipe-li__meta-text', cardDurationElement).first().text();
                    console.log(`cookDuration: ${cookDuration}`);
                    console.log('');

                    suggestedDinners.push({
                        title,
                        link,
                        cookDuration
                    });
                });

            }

            console.log(`Found ${suggestedDinners.length} dinners`);
            //ifs (! intentRequest){
            //    //TODO only used to avoid crashes while testing
            //    return;
            //}
            if (suggestedDinners.length === 0){
                callback(close(intentRequest.sessionAttributes, 'Fulfilled',
                    { contentType: 'PlainText', content: `I could not find any dinners, sorry!` }));
            }
            else {
                const firstDinner = suggestedDinners[0];
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

function translateMainIngredient(ingredient){
    switch (ingredient) {
        case FISH: return 'fisk';
        case MEAT: return 'kjøtt';
        case VEGETARIAN: return 'vegetar';
        default: return 'fisk';
    }
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

//suggestDinnerFunc('fish', 'meny');