const n = [42, 11, 88, 5, 63, 29, 56, 77, 7, 90, 15, 33, 50, 21, 72, 37, 99, 25, 60, 14];

sort(n);

function sort(n) {
  for (let i = 0; i <= n.length; i++) {
    if (i > 0) {
      if (n[i] < n[i - 1]) {
        let temp = n[i];
        n[i] = n[i - 1];
        n[i - 1] = temp;
      }
    }
  }

  if (checkOrdered(n)) {
    console.log(n);
  } else {
    sort(n);
  }
}

function checkOrdered(n) {
  for (let i = 0; i <= n.length; i++) {
    if (i > 0) {
      if (n[i] < n[i - 1]) return false;
    }
  }
  return true;
}
