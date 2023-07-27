function generatePrice(item) {
  // Setting Price
  let price;

  let cost = item.cost;
  let map = item.map; // Map will be number, 0 if there is no map

  price = cost * 1.15; // set price to cost of gun plus 15% then round to 2 decimals
  price = (Math.round(price * 100) / 100).toFixed(2);

  if (price < map) {
    // if new price is lower than map, set price to map
    price = map;
  }

  return price;
}

function generateQuantity(item) {
  // Setting Quantity
  let quantity;

  if (item.quantity >= 50) {
    quantity = 2;
  } else if (item.quantity < 50 && item.quantity >= 20) {
    quantity = 1;
  } else {
    quantity = 0;
  }

  return quantity;
}

function generateTitle(item) {
  var title = item.manufacturer + " " + item.model + " " + item.caliberGauge + " " + item.capacity + " | " + item.upc;

  if (title.length > 75) {
    title = item.manufacturer + " " + item.model + " | " + item.upc;
    if (title.length > 75) {
      return;
    }
  }

  title = Array.from(new Set(title.split(" "))).toString();
  title = title.replaceAll(",", " ");
  title = title.replaceAll(" undefined", "");
  title = title.replaceAll(" null", "");

  return title;
}

export { generatePrice, generateQuantity, generateTitle };
