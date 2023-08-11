let listings = [];
for (let i = 0; i < 10000; i++) {
  let newObject = { x: i, y: i };
  listings.push(newObject);
}

delete listings[28];
delete listings[435];
delete listings[8];
delete listings[261];

/*listings.map((item) => {
  if (item === undefined) {
    console.log(typeof item);
  }
});*/

for (const item of listings) {
  if (item === undefined) {
    console.log(typeof item);
  }
}
