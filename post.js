import { logProcess } from "./index.js";
import axios from "axios";
import descriptionGenerator from "./util/descriptionGenerator.js";
import fs from "fs";
import * as dotenv from "dotenv";
import { GunBrokerAccessToken } from "./index.js";
import { generatePrice, generateQuantity, generateTitle } from "./util/util.js";

dotenv.config();

function postItem(item) {
  return new Promise(async (resolve, reject) => {
    try {
      let thumbnail = fs.readFileSync("./tmp/thumbnail.jpeg");
      let img1 = fs.readFileSync("./tmp/tmp.jpeg");

      // Prepare listing
      var listingSettings = {
        AutoRelist: 1, // Do not relist
        CanOffer: false,
        CategoryID: item.category,
        Characteristics: {
          Manufacturer: item.manufacturer,
          Model: item.model,
          Caliber: item.caliber,
        },
        Condition: 1, // Factory New
        CountryCode: "US",
        Description: descriptionGenerator(item),
        FixedPrice: generatePrice(item),
        InspectionPeriod: 1, // Sales are final
        isFFLRequired: true,
        ListingDuration: 90, // List for 90 days
        MfgPartNumber: item.mfgPartNo,
        PaymentMethods: {
          Check: false,
          VisaMastercard: true,
          COD: false,
          Escrow: false,
          Amex: true,
          PayPal: false,
          Discover: true,
          SeeItemDesc: false,
          CertifiedCheck: false,
          USPSMoneyOrder: true,
          MoneyOrder: true,
          FreedomCoin: false,
        },
        PaymentPlan: 0,
        PremiumFeatures: {
          IsFeaturedItem: false, // No Features
        },
        PostalCode: "33511",
        Prop65Warning: "Cancer and Reproductive Harm www.P65Warnings.ca.gov",
        Quantity: generateQuantity(item),
        UseDefaultSalesTax: true,
        ShippingClassesSupported: {
          Overnight: false,
          TwoDay: false,
          ThreeDay: false,
          Ground: true,
          FirstClass: false,
          Priority: false,
          InStorePickup: false,
          AlaskaHawaii: false,
          Other: false,
        },
        ShippingClassCosts: { Ground: 30 },
        SKU: item.from,
        StandardTextID: 4713,
        Title: generateTitle(item),
        UPC: item.upc,
        WhoPaysForShipping: 8,
        WillShipInternational: false,
        ExcludeStates: "WA,CA",
      };

      const listingSettingsJSON = JSON.stringify(listingSettings);
      const listingSettingsBlob = new Blob([listingSettingsJSON], {
        type: "form-data",
      });
      const thumbnailBlob = new Blob([thumbnail], {
        name: "thumbnail",
        type: "image/jpeg",
        "Content-Disposition": "form-data",
      });
      const img1Blob = new Blob([thumbnail], {
        name: "picture",
        type: "image/jpeg",
        "Content-Disposition": "form-data",
      });
      const img2Blob = new Blob([img1], { name: "picture", type: "image/jpeg", "Content-Disposition": "form-data" });
      const data = new FormData();
      data.append("data", listingSettingsBlob);
      data.append("thumbnail", thumbnailBlob, "thumbnail.jpeg");
      data.append("picture", img1Blob, "picture1.jpeg");
      data.append("picture", img2Blob, "picture2.jpeg");

      let token = await GunBrokerAccessToken;
      //console.log(listingSettings);
      await axios
        .post("https://api.gunbroker.com/v1/Items", data, {
          headers: {
            "Content-Type": "multipart/form-data",
            "X-DevKey": process.env.GUNBROKER_DEVKEY,
            "X-AccessToken": token,
          },
        })
        .then(function (response) {
          logProcess(response.data.userMessage, "good");
        })
        .catch(function (error) {
          console.log(error.response.data);
          reject(error.response.data);
          return;
        });

      resolve();
    } catch (error) {
      logProcess(error, "bad");
      reject(error);
      return;
    }
  });
}

export { postItem };
