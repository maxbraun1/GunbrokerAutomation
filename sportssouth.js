import axios from "axios";
import * as dotenv from "dotenv";
import { xml2js } from "xml-js";
import decodeHtml from "decode-html";

dotenv.config();

async function getInventory() {
  return new Promise(async (resolve, reject) => {
    await axios
      .get(
        "http://webservices.theshootingwarehouse.com/smart/inventory.asmx/DailyItemUpdate?CustomerNumber=" +
          process.env.SS_ACCOUNT_NUMBER +
          "&UserName=" +
          process.env.SS_USERNAME +
          "&Password=" +
          process.env.SS_PASSWORD +
          "&Source=" +
          process.env.SS_SOURCE +
          "&LastUpdate=1/1/1990&LastItem=-1",
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            responseType: "document",
            Accept: "application/xml",
          },
        }
      )
      .then(function (response) {
        let decoded = decodeHtml(response.data);
        let xml = xml2js(decoded, { compact: true, spaces: 2 });
        resolve(xml.string.NewDataSet.Table);
      })
      .catch(function (error) {
        reject(error);
      });
  });
}

function organizeInventory(data) {
  return new Promise(async (resolve, reject) => {
    // Get Manufacturers
    let manufacturers = {};
    await axios
      .get(
        "http://webservices.theshootingwarehouse.com/smart/inventory.asmx/ManufacturerUpdate?CustomerNumber=" +
          process.env.SS_ACCOUNT_NUMBER +
          "&UserName=" +
          process.env.SS_USERNAME +
          "&Password=" +
          process.env.SS_PASSWORD +
          "&Source=-1",
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            responseType: "document",
            Accept: "application/xml",
          },
        }
      )
      .then(function (response) {
        let decoded = decodeHtml(response.data);
        let xml = xml2js(decoded, { compact: true, spaces: 2 });
        let manufacturersUnformated = xml.string.NewDataSet.Table;
        manufacturersUnformated.map((item) => {
          manufacturers[item.MFGNO._text] = item.MFGNM._text.trimEnd();
        });
      })
      .catch(function (error) {
        reject(error);
      });

    // Get Categories
    let categories = {};
    await axios
      .get(
        "http://webservices.theshootingwarehouse.com/smart/inventory.asmx/CategoryUpdate?CustomerNumber=" +
          process.env.SS_ACCOUNT_NUMBER +
          "&UserName=" +
          process.env.SS_USERNAME +
          "&Password=" +
          process.env.SS_PASSWORD +
          "&Source=-1",
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            responseType: "document",
            Accept: "application/xml",
          },
        }
      )
      .then(function (response) {
        let decoded = decodeHtml(response.data);
        let xml = xml2js(decoded, { compact: true, spaces: 2 });
        let categoriesUnformated = xml.string.NewDataSet.Table;
        categoriesUnformated.map((item) => {
          categories[item.CATID._text] = item.CATDES._text.trimEnd();
        });
      })
      .catch(function (error) {
        reject(error);
      });

    let formatted = [];
    for (let item of data) {
      if (parseInt(item.ITYPE._text) == 1 || parseInt(item.ITYPE._text) == 2) {
        if ((await categories[item.CATID._text]) != "LOWERS" && (await categories[item.CATID._text]) != "SPECIALTY") {
          // Skip if undefined
          if (typeof item.IMODEL._text === "undefined") {
            continue;
          }
          if (typeof item.MFGINO._text === "undefined") {
            continue;
          }

          let newItem = {};
          newItem.upc = item.ITUPC._text;
          newItem.price = Number(item.CPRC._text);
          newItem.quantity = parseInt(item.QTYOH._text);
          newItem.map = Number(item.MFPRC._text);
          newItem.desc = item.SHDESC._text.trimEnd();
          newItem.type = parseInt(item.ITYPE._text);
          newItem.model = item.IMODEL._text.trimEnd();
          newItem.manufacturer = await manufacturers[item.IMFGNO._text];
          newItem.img = "https://media.server.theshootingwarehouse.com/large/" + item.PICREF._text + ".jpg";
          newItem.category = await categories[item.CATID._text];
          newItem.mfgPartNumber = item.MFGINO._text.trimEnd();
          newItem.series = item.SERIES._text ? item.SERIES._text.trimEnd() : undefined;

          // Normalize Categories
          if (
            newItem.category.trimEnd() == "RIFLES CENTERFIRE TACTICAL" ||
            newItem.category.trimEnd() == "RIFLES CENTERFIRE"
          ) {
            newItem.category == "RIFLES";
          } else if (newItem.category.trimEnd() == "SHOTGUNS TACTICAL") {
            newItem.category == "SHOTGUNS";
          }

          // Attributes listed differently for pistols vs rifles
          if (parseInt(item.ITYPE._text) == 1) {
            // if pistol

            if (typeof item.ITATR5._text === "undefined") {
              continue;
            }
            if (typeof item.ITATR3._text === "undefined") {
              continue;
            }
            if (typeof item.ITATR2._text === "undefined") {
              continue;
            }

            newItem.capacity = item.ITATR5._text.trimEnd();
            newItem.caliber = item.ITATR3._text.trimEnd();
            newItem.action = item.ITATR2._text.trimEnd();
          } else {
            // if long-gun

            if (typeof item.ITATR4._text === "undefined") {
              continue;
            }
            if (typeof item.ITATR2._text === "undefined") {
              continue;
            }
            if (typeof item.ITATR1._text === "undefined") {
              continue;
            }

            newItem.capactiy = item.ITATR4._text.trimEnd();
            newItem.caliber = item.ITATR2._text.trimEnd();
            newItem.action = item.ITATR1._text.trimEnd();
          }

          formatted.push(newItem);
        }
      }
    }
    resolve(formatted);
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

function filterInventory(inventory) {
  let lowestQuantityAllowed = 20;
  let lowestPriceAllowed = 150;
  let highestPriceAllowed = 2000;
  let filtered = [];

  inventory.map(async (item) => {
    if (
      item.quantity >= lowestQuantityAllowed &&
      item.price > lowestPriceAllowed &&
      item.price < highestPriceAllowed &&
      item.upc.length == 12 &&
      item.caliber &&
      item.capacity
    ) {
      filtered.push(item);
    }
  });
  return filtered;
}

async function normalizeInventory(dataset) {
  let formattedInventory = [];
  dataset.map((item) => {
    let cat = findCategory(item.category, item.action);
    let newItem = {};

    newItem.cost = item.price;
    newItem.msrp = null;
    newItem.upc = item.upc;
    newItem.imgURL = item.img;
    newItem.map = item.map;
    newItem.desc = item.desc;
    newItem.quantity = item.quantity;
    newItem.caliber = item.caliber;
    newItem.manufacturer = item.manufacturer.toLowerCase();
    newItem.action = item.action;
    newItem.capacity = item.capacity;
    newItem.model = item.model;
    newItem.category = cat.categoryID;
    newItem.shippingCost = cat.ShippingPrice;
    newItem.mfgPartNo = item.mfgPartNumber;
    newItem.from = "SS";

    newItem.extra = [["Series", item.series]];

    formattedInventory.push(newItem);
  });

  return formattedInventory;
}

function findCategory(category, action) {
  // Setting Category IDs and Shipping Prices
  let categoryID;
  let ShippingPrice = 30;

  switch (category) {
    case "SHOTGUNS":
      switch (action) {
        case "Semi-Auto":
          categoryID = 3105;
          break;
        case "Lever":
          categoryID = 3113;
          break;
        case "Bolt":
          categoryID = 3112;
          break;
        case "Break Open":
          categoryID = 3104;
          break;
        case "Pump":
          categoryID = 3106;
          break;
        default:
          categoryID = 3108;
      }
      break;
    case "PISTOLS":
      switch (action) {
        case "Semi-Auto":
          categoryID = 3026;
          ShippingPrice = 29;
          break;
        case "Striker Fire":
          categoryID = 3026;
          ShippingPrice = 29;
          break;
        case "SA/DA":
          categoryID = 3026;
          ShippingPrice = 29;
          break;
        case "DAO":
          categoryID = 3026;
          ShippingPrice = 29;
          break;
        case "DA/SA":
          categoryID = 3026;
          ShippingPrice = 29;
          break;
        case "SAO":
          categoryID = 3026;
          ShippingPrice = 29;
          break;
        case "Bolt":
          categoryID = 3101;
          ShippingPrice = 29;
          break;
        default:
          categoryID = 3027;
          ShippingPrice = 29;
      }
      break;
    case "RIFLES":
      switch (action) {
        case "Semi-Auto":
          categoryID = 3024;
          break;
        case "Bolt":
          categoryID = 3022;
          break;
        case "Lever":
          categoryID = 3023;
          break;
        case "Pump":
          categoryID = 3106;
          break;
        default:
          categoryID = 3025;
      }
      break;
    case "REVOLVERS":
      categoryID = 2325;
      break;
    default:
      categoryID = 3026;
  }

  return { categoryID: categoryID, ShippingPrice: ShippingPrice };
}

async function prepSSInventory() {
  let unorganizedInventory = await getInventory();
  let inventory = await organizeInventory(unorganizedInventory);
  let filteredInventory = filterInventory(inventory);
  let normalizedInventory = await normalizeInventory(filteredInventory);
  return normalizedInventory;
}

async function checkSSInventory() {
  // gets a simplified summary of inventory for checking quantities
  let unorganizedInventory = await getInventory();
  let inventory = await organizeInventory(unorganizedInventory);
  let minimizedInventory = minimizeInventory(inventory);
  return minimizedInventory;
}

export { prepSSInventory, checkSSInventory };
