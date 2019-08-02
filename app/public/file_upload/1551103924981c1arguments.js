function sum() {
    var hasil = 0;
    for (i = 0; i < arguments.length; i++) {
        hasil = hasil + arguments[i];
    }
    console.log(hasil);
}

sum(1, 2, 7)