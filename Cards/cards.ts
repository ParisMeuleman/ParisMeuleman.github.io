export {}

enum Format { A4, A5, A6, Standard, Mini, Dixit}
let FormatSpec = {
    A4: { width: 210, height: 297, display:"A4"},
    A5: { width: 149, height: 210, display:"A4"},
    A6: { width: 105, height: 149, display:"A4"},
    Poker: { width: 63.5, height: 88.9, display:"A4"},
    Bridge: { width: 57.2, height: 88.9, display:"A4"},
    Tarot: { width: 70, height: 120, display:"A4"},
    Mini: { width: 41, height: 63, display:"A4"},
    StandardEuro: { width: 59, height: 92, display:"A4"},
    MiniEuro: { width: 44, height: 68, display:"A4"},
    CursedCityBig: { width: 110, height: 150, display:"A4"},
    CursedCityMedium: { width: 65, height: 100, display:"A4"},
    Dixit: { width: 79, height: 120, display:"A4"},
    AeronauticaBig: { width: 73, height: 107, display:"A4"},
    AeronauticaSmall: { width: 43, height: 63, display:"A4"},
}
class Carte {
    format= Format;
}