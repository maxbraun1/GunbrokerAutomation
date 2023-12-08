import axios from "axios";
import * as dotenv from "dotenv";
import chalk from "chalk";

dotenv.config();

let LipseyAuthToken = new Promise(function (resolve, reject) {
  const login_credentials = {
    Email: process.env.LIPSEY_EMAIL,
    Password: process.env.LIPSEY_PASSWORD,
  };
  axios
    .post("https://api.lipseys.com/api/Integration/Authentication/Login", login_credentials, {
      headers: {
        PresetUrl: process.env.LIPSEYS_KEY,
        "Content-Type": "application/json",
      },
    })
    .then(function (response) {
      resolve(response.data.token);
    })
    .catch(function (error) {
      reject(new Error(error));
    });
});

function getInventory() {
  return new Promise(async (resolve, reject) => {
    let token = await LipseyAuthToken;
    await axios
      .get("https://api.lipseys.com/api/Integration/Items/CatalogFeed", {
        headers: {
          PresetUrl: process.env.LIPSEYS_KEY,
          Token: token,
        },
      })
      .then(function (response) {
        resolve(response.data.data);
      })
      .catch(function (error) {
        reject(error);
      });
  });
}

function minimizeInventory(inventory) {
  let minimized = [];

  inventory.map((item) => {
    let min = {};
    min.upc = item.upc;
    min.cost = item.price;
    min.quantity = item.quantity;

    minimized.push(min);
  });

  return minimized;
}

async function filterInventory(dataset) {
  let lowestQuantityAllowed = 20;
  let typesAllowed = ["Semi-Auto Pistol", "Rifle", "Revolver", "Shotgun"];
  let filtered = [];

  await dataset.map(async (item) => {
    if (
      item.quantity >= lowestQuantityAllowed &&
      typesAllowed.includes(item.type) &&
      item.allocated == false &&
      item.price > 150 &&
      item.upc.toString().length == 12
    ) {
      filtered.push(item);
    }
  });
  return filtered;
}

async function normalizeInventory(dataset) {
  let formattedInventory = [];
  dataset.map((item) => {
    let cat = findCategory(item.type, item.action);
    let newItem = {};

    newItem.cost = item.price;
    newItem.msrp = item.msrp;
    newItem.upc = item.upc;
    newItem.mfgPartNo = item.manufacturerModelNo;
    newItem.imgURL = "https://www.lipseyscloud.com/images/" + item.imageName;
    newItem.map = item.retailMap;
    newItem.desc = item.description1;
    newItem.quantity = item.quantity;
    newItem.caliber = item.caliberGauge;
    newItem.manufacturer = item.manufacturer;
    newItem.action = item.action;
    newItem.capacity = item.capacity;
    newItem.model = item.model;
    newItem.category = cat.categoryID;
    newItem.shippingCost = cat.ShippingPrice;
    newItem.from = "LIP";

    newItem.extra = [
      ["Overall Length", item.overallLength],
      ["Finish", item.finish],
      ["Sights", item.sightsType],
      ["Barrel Length", item.barrelLength],
    ];

    formattedInventory.push(newItem);
  });
  return formattedInventory;
}

function findCategory(type, action) {
  // Setting Category IDs and Shipping Prices
  let categoryID;
  let ShippingPrice = 30;

  switch (type) {
    case "Semi-Auto Pistol":
      ShippingPrice = 29;
      categoryID = 3026;
      break;
    case "Rifle":
      switch (action) {
        case "Semi-Auto":
          categoryID = 3024;
          break;
        case "Single Shot":
          categoryID = 3011;
          break;
        case "Pump Action":
          categoryID = 3102;
          break;
        case "Bolt Action":
          categoryID = 3022;
          break;
        case "Lever Action":
          categoryID = 3023;
          break;
        default:
          categoryID = 3025;
      }
      break;
    case "Revolver":
      categoryID = 2325;
      break;
    case "Shotgun":
      switch (action) {
        case "Semi-Auto":
          categoryID = 3105;
          break;
        case "Side By Side":
          categoryID = 3104;
          break;
        case "Over / Under":
          categoryID = 3103;
          break;
        case "Pump Action":
          categoryID = 3106;
          break;
        default:
          categoryID = 3108;
      }
      break;
    default:
      categoryID = 3004;
  }

  return { categoryID: categoryID, ShippingPrice: ShippingPrice };
}

async function prepLipseysInventory() {
  console.log(chalk.yellow("Fetching Inventory..."));
  let inventory = await getInventory().catch((error) => console.log(error));
  console.log(chalk.yellow("Filtering Inventory..."));
  let filteredInventory = await filterInventory(inventory);
  console.log(chalk.yellow("Normalizing Inventory..."));
  let normalizedInventory = await normalizeInventory(filteredInventory);
  return normalizedInventory;
}

async function checkLipseysInventory() {
  // gets a simplified summary of inventory for checking quantities
  let inventory = await getInventory().catch((error) => console.log(error));
  let minimizedInventory = minimizeInventory(inventory);
  return minimizedInventory;
}

export { prepLipseysInventory, checkLipseysInventory };
