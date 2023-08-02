import fs from "fs";
import * as dotenv from "dotenv";
import * as ftp from "basic-ftp";
import csvToJson from "convert-csv-to-json/src/csvToJson.js";
import chalk from "chalk";

dotenv.config();

async function getInventoryFile() {
  const client = new ftp.Client();
  client.ftp.verbose = false;
  try {
    await client.access({
      host: "ftp.davidsonsinventory.com",
      user: process.env.DAVIDSONS_FTP_USERNAME,
      password: process.env.DAVIDSONS_FTP_PASSWORD,
      secure: false,
    });
    await client.downloadTo("files/davidsons_inventory.csv", "davidsons_inventory.csv");
    await client.downloadTo("files/DAV-inventory-with-MAP.txt", "DAV-inventory-with-MAP.txt");
    await client.downloadTo("files/davidsons_quantity.csv", "davidsons_quantity.csv");
  } catch (err) {
    console.log(err);
  }
  client.close();
}

async function getInventory() {
  await getInventoryFile();

  let revolverExtras = [
    "Revolver: Single Action",
    "Revolver: Double Action",
    "Revolver: Double Action Only",
    "Revolver: Single|Double",
  ];
  let rifleExtras = ["Rifle: Single Shot", "Rifle: Single Action"];
  let pistolExtras = ["Pistol: Derringer", "Pistol: Lever Action", "Pistol: Bolt Action", "Pistol: Single Action"];
  let shotgunMisc = ["Shotgun: Over and Under", "Shotgun: Over And Under"];
  let shotgunMisc2 = ["Shotgun: Side by Side", "Shotgun: Side By Side"];

  const data = fs.readFileSync("files/DAV-inventory-with-MAP.txt", "utf-8");
  const result = String(data).replace(/["]+/g, "");
  fs.writeFileSync("files/DAV-inventory-with-MAP.txt", result, "utf-8");

  let productMAPs = csvToJson
    .fieldDelimiter("\t")
    .formatValueByType()
    .getJsonFromCsv("files/DAV-inventory-with-MAP.txt");
  let DavidsonsQuantities = csvToJson.fieldDelimiter(",").getJsonFromCsv("files/davidsons_quantity.csv");

  productMAPs = productMAPs.map((item) => {
    let map;
    let newItem = {};
    if (item["RETAIL-MAP"] == "N/A") {
      map = 0;
    } else {
      map = Number(item["RETAIL-MAP"]);
    }

    newItem.upc = item.UPC;
    newItem.map = map;
    return newItem;
  });

  let products = csvToJson.fieldDelimiter(",").getJsonFromCsv("files/davidsons_inventory.csv");

  let items = products.map((item) => {
    if (item.Quantity == "A*") {
      item.Quantity = 0;
    } else {
      let quantityInfo = DavidsonsQuantities.find((product) => product.UPC_Code == item.UPCCode.replaceAll("#", ""));

      if (quantityInfo) {
        item.Quantity =
          parseInt(quantityInfo.Quantity_NC.replace("+", "")) + parseInt(quantityInfo.Quantity_AZ.replace("+", ""));
      } else {
        item.Quantity = parseInt(item.Quantity);
      }
    }

    let info = productMAPs.find((product) => product.upc == item.UPCCode.replace("#", ""));
    let map;
    if (!info) {
      map = 0;
    } else {
      map = info.map;
    }

    item.itemNo = item["Item#"];
    item.map = map;
    item.MSP = Number(item.MSP.replace("$", ""));
    item.DealerPrice = Number(item.DealerPrice.replace("$", ""));
    item.RetailPrice = Number(item.RetailPrice.replace("$", ""));
    item.UPCCode = item.UPCCode.replaceAll("#", "");
    item.imageURL =
      "https://res.cloudinary.com/davidsons-inc/c_lpad,dpr_2.0,f_auto,h_635,q_100,w_635/v1/media/catalog/product/" +
      item.itemNo.charAt(0) +
      "/" +
      item.itemNo.charAt(1) +
      "/" +
      item.itemNo +
      ".jpg";

    if (revolverExtras.includes(item.GunType)) {
      item.GunType = "Revolver";
    }
    if (rifleExtras.includes(item.GunType)) {
      item.GunType = "Rifle";
    }
    if (pistolExtras.includes(item.GunType)) {
      item.GunType = "Pistol";
    }
    if (shotgunMisc.includes(item.GunType)) {
      item.GunType = "Shotgun: Over and Under";
    }
    if (shotgunMisc2.includes(item.GunType)) {
      item.GunType = "Shotgun: Side by Side";
    }
    if (item.GunType == "Shotgun: Pump") {
      item.GunType = "Shotgun: Pump Action";
    }

    delete item["Item#"];
    delete item.SalePrice;
    delete item.SaleEnds;

    return item;
  });
  return items;
}

function minimizeInventory(inventory) {
  let minimized = [];

  inventory.map((item) => {
    let min = {};
    min.upc = item.UPCCode;
    min.cost = item.DealerPrice;
    min.quantity = item.Quantity;

    minimized.push(min);
  });

  return minimized;
}

function filterInventory(inventory) {
  let lowestQuantityAllowed = 20;
  let lowestPriceAllowed = 150;
  let typesAllowed = [
    "Pistol: Semi-Auto",
    "Pistol",
    "Rifle: Semi-Auto",
    "Rifle: Bolt Action",
    "Rifle: Lever Action",
    "Rifle: Pump Action",
    "Rifle",
    "Revolver",
    "Shotgun: Pump Action",
    "Shotgun: Over and Under",
    "Shotgun: Semi-Auto",
    "Shotgun: Lever Action",
    "Shotgun: Single Shot",
    "Shotgun: Bolt Action",
    "Shotgun: Side by Side",
  ];
  let filtered = [];

  inventory.map(async (item) => {
    if (
      item.Quantity >= lowestQuantityAllowed &&
      typesAllowed.includes(item.GunType) &&
      item.DealerPrice > lowestPriceAllowed
    ) {
      filtered.push(item);
    }
  });
  return filtered;
}

async function normalizeInventory(dataset) {
  let normalizedInventory = [];
  dataset.map((item) => {
    let cat = findCategory(item);
    let newItem = {};

    newItem.cost = item.DealerPrice;
    newItem.msrp = item.RetailPrice;
    newItem.upc = item.UPCCode;
    newItem.imgURL = item.imageURL;
    newItem.map = item.map;
    newItem.desc = item.ItemDescription;
    newItem.quantity = item.Quantity;
    newItem.caliber = item.Caliber;
    newItem.manufacturer = item.Manufacturer;
    newItem.action = item.Action;
    newItem.capacity = item.Capacity;
    newItem.model = item.ModelSeries;
    newItem.mfgPartNo = item.ModelSeries;
    newItem.category = cat.categoryID;
    newItem.shippingCost = cat.ShippingPrice;
    newItem.from = "DAV";

    newItem.extra = [
      ["Overall Length", item.OverallLength],
      ["Finish", item.Finish],
      ["Sights", item.Sights],
      ["Barrel Length", item.BarrelLength],
      ["Features", item.Features],
    ];

    normalizedInventory.push(newItem);
  });

  return normalizedInventory;
}

function findCategory(item) {
  // Setting Category IDs and Shipping Prices
  let categoryID;
  let ShippingPrice = 30;

  switch (item.GunType) {
    case "Pistol: Semi-Auto":
      ShippingPrice = 29;
      categoryID = 3026;
      break;
    case "Pistol":
      ShippingPrice = 29;
      categoryID = 3027;
      break;
    case "Rifle: Semi-Auto":
      categoryID = 3024;
      break;
    case "Rifle: Bolt Action":
      categoryID = 3022;
      break;
    case "Rifle: Lever Action":
      categoryID = 3023;
      break;
    case "Rifle: Pump Action":
      categoryID = 3102;
      break;
    case "Rifle":
      categoryID = 3025;
      break;
    case "Revolver":
      ShippingPrice = 29;
      categoryID = 2325;
      break;
    case "Shotgun: Pump Action":
      categoryID = 3106;
      break;
    case "Shotgun: Over and Under":
      categoryID = 3103;
      break;
    case "Shotgun: Semi-Auto":
      categoryID = 3105;
      break;
    case "Shotgun: Lever Action":
      categoryID = 3113;
      break;
    case "Shotgun: Single Shot":
      categoryID = 3107;
      break;
    case "Shotgun: Bolt Action":
      categoryID = 3112;
      break;
    case "Shotgun: Side by Side":
      categoryID = 3104;
      break;
    default:
      categoryID = 3004;
  }

  return { categoryID: categoryID, ShippingPrice: ShippingPrice };
}

async function prepDavidsonsInventory() {
  console.log(chalk.yellow("Fetching Inventory..."));
  let inventory = await getInventory();
  console.log(chalk.yellow("Filtering Inventory..."));
  let filteredInventory = filterInventory(inventory);
  console.log(chalk.yellow("Normalizing Inventory..."));
  let normalizedInventory = normalizeInventory(filteredInventory);
  return normalizedInventory;
}

async function checkDavidsonsInventory() {
  // gets a simplified summary of inventory for checking quantities
  let inventory = await getInventory();
  let minimizedInventory = minimizeInventory(inventory);
  return minimizedInventory;
}

export { prepDavidsonsInventory, checkDavidsonsInventory };
