import axios from "axios";
import fs from "fs";
import * as dotenv from "dotenv";
import chalk from "chalk";
import { prepLipseysInventory, checkLipseysInventory } from "./lipseys.js";
import { prepDavidsonsInventory, checkDavidsonsInventory } from "./davidsons.js";
import { prepRSRInventory, checkRSRInventory } from "./rsr.js";
import { prepSSInventory, checkSSInventory } from "./sportssouth.js";
import { generateImages } from "./imageGenerator.js";
import { postItem } from "./post.js";

dotenv.config();

function logProcess(message, type) {
  console.log("_________________________________________________________________________________");
  switch (type) {
    case "good":
      console.log(chalk.green(message));
      break;
    case "bad":
      console.log(chalk.red(message));
      break;
    case "warning":
      console.log(chalk.yellow(message));
      break;
    default:
      console.log(chalk.magenta(message));
  }
}

let GunBrokerAccessToken = new Promise(function (resolve, reject) {
  const gunbroker_credentials = { Username: process.env.GUNBROKER_USERNAME, Password: process.env.GUNBROKER_PASSWORD };
  axios
    .post("https://api.gunbroker.com/v1/Users/AccessToken", gunbroker_credentials, {
      headers: {
        "Content-Type": "application/json",
        "X-DevKey": process.env.GUNBROKER_DEVKEY,
      },
    })
    .then(function (response) {
      resolve(response.data.accessToken);
    })
    .catch(function (error) {
      reject(new Error(error));
    });
});

let currentUserID = new Promise(async (resolve, reject) => {
  let token = await GunBrokerAccessToken;
  axios
    .get("https://api.gunbroker.com/v1/Users/AccountInfo", {
      headers: {
        "Content-Type": "application/json",
        "X-DevKey": process.env.GUNBROKER_DEVKEY,
        "X-AccessToken": token,
      },
    })
    .then(function (response) {
      resolve(response.data.userSummary.userID);
    })
    .catch(function (error) {
      reject(new Error(error));
    });
});

function checkAlreadyPosted(upc) {
  return new Promise(async (resolve, reject) => {
    let userID = await currentUserID;
    let token = await GunBrokerAccessToken;
    axios
      .get("https://api.gunbroker.com/v1/Items?IncludeSellers=" + userID + "&UPC=" + upc, {
        headers: {
          "Content-Type": "application/json",
          "X-DevKey": process.env.GUNBROKER_DEVKEY,
          "X-AccessToken": token,
        },
      })
      .then(function (response) {
        if (response.data.countReturned > 0) {
          // Product Already Posted
          resolve(true);
        } else {
          resolve(false);
        }
      })
      .catch(function (error) {
        console.log(error);
        reject(new Error(error));
      });
  });
}

function getAllListings() {
  return new Promise(async (resolve, reject) => {
    let userID = await currentUserID;
    let token = await GunBrokerAccessToken;
    await axios
      .get("https://api.gunbroker.com/v1/Items?BuyNowOnly=true&PageSize=1&IncludeSellers=" + userID, {
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "axios 0.21.1",
          "X-DevKey": process.env.GUNBROKER_DEVKEY,
          "X-AccessToken": token,
        },
      })
      .then(async (response) => {
        let listings = [];
        let listingsNum = response.data.countReturned; // Total number of listinigs
        let iterations = Math.ceil(listingsNum / 300); // Number of times to request results in sets of 300
        for (let i = 1; i <= iterations; i++) {
          let token = await GunBrokerAccessToken;
          await axios
            .get(
              "https://api.gunbroker.com/v1/Items?BuyNowOnly=true&PageSize=300&PageIndex=" +
                i +
                "&IncludeSellers=" +
                userID,
              {
                headers: {
                  "Content-Type": "application/json",
                  "X-DevKey": process.env.GUNBROKER_DEVKEY,
                  "X-AccessToken": token,
                },
              }
            )
            .then((response) => {
              // get item IDs of all listings returned

              for (const listing in response.data.results) {
                listings.push(response.data.results[listing].itemID);
              }
            })
            .catch(function (error) {
              console.log(error);
              reject(new Error(error));
            });
        }
        resolve(listings);
      })
      .catch(function (error) {
        console.log(error);
        reject(new Error(error));
      });
  });
}

async function getListing(itemNo) {
  return new Promise(async (resolve, reject) => {
    let token = await GunBrokerAccessToken;
    await axios
      .get("https://api.gunbroker.com/v1/Items/" + itemNo, {
        headers: {
          "Content-Type": "application/json",
          "X-DevKey": process.env.GUNBROKER_DEVKEY,
          "X-AccessToken": token,
          "User-Agent": "axios 0.21.1",
        },
      })
      .then((response) => {
        resolve({
          itemNo: itemNo,
          upc: response.data.upc,
          price: response.data.buyPrice,
          quantity: response.data.quantity,
          description: response.data.description,
        });
      })
      .catch((error) => {
        reject(error);
      });
  });
}

async function checkAllListings() {
  // Get every Gunbroker listing item No
  logProcess("Getting all GunBroker listings");
  let listings = await getAllListings();

  // Get every listing from Lipseys, Davidsons, RSR, and SportsSouth
  logProcess("Getting Lipseys Inventory");
  let LipseysInventory = await checkLipseysInventory();
  logProcess("Getting Davidsons Inventory");
  let DavidsonsInventory = await checkDavidsonsInventory();
  logProcess("Getting RSR Inventory");
  let RSRInventory = await checkRSRInventory();
  logProcess("Getting Sports South Inventory");
  let SSInventory = await checkSSInventory();

  let potentialDeletes = [];

  if (
    LipseysInventory.length < 100 ||
    DavidsonsInventory.length < 100 ||
    RSRInventory.length < 100 ||
    SSInventory.length < 100
  ) {
    console.log("Fetching of one or more vendors failed.");
    return;
  }

  // Loop through every gunbroker listing
  console.log(chalk.green.bold("Checking " + listings.length + " listings."));
  for (let i = 0; i < listings.length; i++) {
    let listing = await getListing(listings[i]).catch((error) => {
      console.log(error);
    });

    if (listing) {
      let lipseysResults = await LipseysInventory.find((item) => item.upc == listing.upc);
      let RSRResults = await RSRInventory.find((item) => item.upc == listing.upc);
      let davidsonsResults = await DavidsonsInventory.find((item) => item.upc == listing.upc);
      let SSResults = await SSInventory.find((item) => item.upc == listing.upc);
      if (lipseysResults == undefined) {
        lipseysResults = {};
        lipseysResults.quantity = 0;
      }
      if (RSRResults == undefined) {
        RSRResults = {};
        RSRResults.quantity = 0;
      }
      if (davidsonsResults == undefined) {
        davidsonsResults = {};
        davidsonsResults.quantity = 0;
      }
      if (SSResults == undefined) {
        SSResults = {};
        SSResults.quantity = 0;
      }

      let totalAvailableQuantity =
        lipseysResults.quantity + RSRResults.quantity + davidsonsResults.quantity + SSResults.quantity;

      if (listing.quantity > totalAvailableQuantity - 10) {
        if (listing.upc) {
          potentialDeletes.push(listing.upc);

          console.log(chalk.bold.bgYellow.black("--- Potential Delete ---"));
          console.log(chalk.red.bold(listing.upc + " (" + listing.quantity + " listed)"));
          console.log(chalk.bold.white(lipseysResults.quantity + " listed on Lipseys"));
          console.log(chalk.bold.white(davidsonsResults.quantity + " listed on Davidsons"));
          console.log(chalk.bold.white(RSRResults.quantity + " listed on RSR"));
          console.log(chalk.bold.white(SSResults.quantity + " listed on Sports South"));
        }
      }
    }
  }

  var file = fs.createWriteStream("./files/GunBrokerUPCChecks.txt");
  file.on("error", function (err) {
    console.log(err);
  });
  file.write(
    "These UPCs are listed on GunBroker but may not be available (checked Lipseys, Davidsons, and RSR Group)\n"
  );
  potentialDeletes.forEach(function (upc) {
    file.write(upc + "\n");
  });
  file.end();
}

async function checkDuplicates(inventory) {
  let duplicateCount = 0;
  let newInventory = await inventory.map((item) => {
    let matches = inventory.filter((x) => x.upc == item.upc && x.from != item.from);
    if (matches.length > 0) {
      duplicateCount = duplicateCount + matches.length;
      let highestCost = item.cost;
      let quantity = item.quantity;
      matches.map((match) => {
        quantity = quantity + match.quantity;
        if (match.cost > highestCost) {
          highestCost = match.cost;
        }
        inventory.splice(inventory.indexOf(match), 1);
      });
      item.cost = highestCost;
      item.quantity = quantity;
    }
    return item;
  });
  console.log(chalk.bold.yellow("Found " + duplicateCount + " duplicates."));
  return newInventory;
}

async function postAllItems(listings, limit) {
  logProcess("Posting " + chalk.bold.green(listings.length) + " items on GunBroker.");

  let count = 0;
  let countPosted = 0;

  for (let item of listings) {
    count++;

    if (countPosted >= limit) {
      return;
    }

    // Check if item is already posted
    let alreadyPosted = await checkAlreadyPosted(item.upc);
    if (alreadyPosted) {
      console.log(
        chalk.bold.blue.bgWhite(" Item " + count + " / " + listings.length + " ") +
          chalk.bold.yellow(" [" + item.upc + "] Item already posted.")
      );
    } else {
      await generateImages(item.imgURL)
        .then(async () => {
          await postItem(item)
            .catch((error) => console.log(error))
            .then(() => {
              countPosted++;
              console.log(
                chalk.bold.blue.bgWhite(" Item " + count + " / " + listings.length + " ") +
                  chalk.bold.green(
                    " [" + item.upc + "] " + item.from + " Item (" + item.manufacturer + " " + item.model + ") Posted"
                  )
              );
            });
        })
        .catch((error) => {
          console.log(error);
        });
    }
  }
  console.log(chalk.bold.green("Posting complete. " + countPosted + " listings posted."));
  return countPosted;
}

async function post(config) {
  let inventory = [];

  if (config.lip) {
    console.log(chalk.bold.green("------------- LIPSEYS -------------"));
    let lipseysInventory = await prepLipseysInventory();
    //console.log(lipseysInventory.length);
    inventory.push(...lipseysInventory);
  }
  if (config.dav) {
    console.log(chalk.bold.green("------------ DAVIDSONS ------------"));
    let davidsonsInventory = await prepDavidsonsInventory();
    //console.log(davidsonsInventory.length);
    inventory.push(...davidsonsInventory);
  }
  if (config.rsr) {
    console.log(chalk.bold.green("--------------- RSR ---------------"));
    let rsrInventory = await prepRSRInventory();
    //console.log(rsrInventory.length);
    inventory.push(...rsrInventory);
  }
  if (config.ss) {
    console.log(chalk.bold.green("----------- SPORTS SOUTH ----------"));
    let ssInventory = await prepSSInventory();
    //console.log(ssInventory.length);
    inventory.push(...ssInventory);
  }

  // Check for duplicates
  inventory = await checkDuplicates(inventory);

  console.log(inventory.length + " total products to post.");

  await postAllItems(inventory, config.limit);
}

export { logProcess, GunBrokerAccessToken };

// START (Uncomment function to run)
post({ lip: false, dav: false, rsr: false, ss: true });
//checkAllListings();
