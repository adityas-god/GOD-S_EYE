import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const defaultSites = [
  {
    "name": "DHL- Figs",
    "product_line": "RMS",
    "opsgenie_tag": "dhl-figs",
    "salesforce_account_id": "001OX00000qZLalYAG",
    "position": 1
  },
  {
    "name": "H&M Canada Ajax",
    "product_line": "RA",
    "opsgenie_tag": "hm-canada-ajax",
    "salesforce_account_id": "001OX00000qZLazYAG",
    "position": 2
  },
  {
    "name": "Kenco-Jeff1",
    "product_line": "Case Pick",
    "opsgenie_tag": "kenco-jeff1",
    "salesforce_account_id": "001OX00000wBXAmYAO",
    "position": 3
  },
  {
    "name": "Sams Club ATL",
    "product_line": "RMS",
    "opsgenie_tag": "sams-club-atl",
    "salesforce_account_id": "001OX00000qZLbBYAW",
    "position": 4
  },
  {
    "name": "Goldbond",
    "product_line": "RMS",
    "opsgenie_tag": "goldbond",
    "salesforce_account_id": "001OX00000qZLarYAG",
    "position": 5
  },
  {
    "name": "Lakeside Book",
    "product_line": "RIL",
    "opsgenie_tag": "lakeside-book",
    "salesforce_account_id": "001OX00000qZLb2YAG",
    "position": 6
  },
  {
    "name": "Walmart Mexico",
    "product_line": "RMS",
    "opsgenie_tag": "walmart-mexico",
    "salesforce_account_id": "001OX00000qZLbRYAW",
    "position": 7
  },
  {
    "name": "Apotek",
    "product_line": "RMS",
    "opsgenie_tag": "apotek",
    "salesforce_account_id": "001OX00000qZLagYAG",
    "position": 8
  },
  {
    "name": "Ryder Whiplash",
    "product_line": "RIL",
    "opsgenie_tag": "ryder-whiplash",
    "salesforce_account_id": "001OX00000qZLb9YAG",
    "position": 9
  },
  {
    "name": "Sodimac-Colombia-Funza-2",
    "product_line": "Case Pick",
    "opsgenie_tag": "sodimac-colombia-funza-2",
    "salesforce_account_id": "001OX00000qZLbMYAW",
    "position": 10
  },
  {
    "name": "Essilor Luxottica",
    "product_line": "RIL",
    "opsgenie_tag": "essilor-luxottica",
    "salesforce_account_id": "001OX00000qZLanYAG",
    "position": 11
  },
  {
    "name": "Essilor Luxottica Atlanta",
    "product_line": "RIL",
    "opsgenie_tag": "essilor-luxottica-atlanta",
    "salesforce_account_id": "001OX00000y2YKnYAM",
    "position": 12
  },
  {
    "name": "Essilor Luxottica -Columbus",
    "product_line": "RIL",
    "opsgenie_tag": "essilor-luxottica-columbus",
    "salesforce_account_id": "001OX00000qZLaoYAG",
    "position": 13
  },
  {
    "name": "Ryder Maryland",
    "product_line": "RIL",
    "opsgenie_tag": "ryder-maryland",
    "salesforce_account_id": "001OX00000qZLbAYAW",
    "position": 13
  },
  {
    "name": "Mercado Libre (MX13)",
    "product_line": "RIL",
    "opsgenie_tag": "mercado-libre-mx13",
    "salesforce_account_id": "001OX00000vOXyCYAW",
    "position": 14
  },
  {
    "name": "YKK",
    "product_line": "RIL",
    "opsgenie_tag": "ykk",
    "salesforce_account_id": "001OX00000qZLbUYAW",
    "position": 15
  },
  {
    "name": "GXO-H&M Prod",
    "product_line": "RA",
    "opsgenie_tag": "gxo-hm-prod",
    "salesforce_account_id": "001OX00000qZLavYAG",
    "position": 16
  },
  {
    "name": "Sams Club LAX",
    "product_line": "RMS",
    "opsgenie_tag": "sams-club-lax",
    "salesforce_account_id": "001OX00000qZLbCYAW",
    "position": 17
  },
  {
    "name": "GXO-AF",
    "product_line": "RIL",
    "opsgenie_tag": "gxo-af",
    "salesforce_account_id": "001OX00000qZLatYAG",
    "position": 18
  },
  {
    "name": "Aritzia",
    "product_line": "RA",
    "opsgenie_tag": "aritzia",
    "salesforce_account_id": "001OX00000qZLahYAG",
    "position": 19
  },
  {
    "name": "Sodimac Colombia Arthur",
    "product_line": "Case Pick",
    "opsgenie_tag": "sodimac-colombia-arthur",
    "salesforce_account_id": "001OX00000qZcbHYAS",
    "position": 20
  },
  {
    "name": "Active Ants-Belgium",
    "product_line": "RA",
    "opsgenie_tag": "active-ants-belgium",
    "salesforce_account_id": "001OX00000qZU2gYAG",
    "position": 21
  },
  {
    "name": "Active Ants-Germany",
    "product_line": "RA",
    "opsgenie_tag": "active-ants-germany",
    "salesforce_account_id": "001OX00000qZU2hYAG",
    "position": 22
  },
  {
    "name": "Active Ants-NL",
    "product_line": "RA",
    "opsgenie_tag": "active-ants-nl",
    "salesforce_account_id": "001OX00000qZU2iYAG",
    "position": 23
  },
  {
    "name": "Active Ants-UK Northampton",
    "product_line": "RA",
    "opsgenie_tag": "active-ants-uk-northampton",
    "salesforce_account_id": "001OX00000qZU2jYAG",
    "position": 24
  },
  {
    "name": "Adam Beverages",
    "product_line": "RMS",
    "opsgenie_tag": "adam-beverages",
    "salesforce_account_id": "001OX00000qZU2kYAG",
    "position": 25
  },
  {
    "name": "Apple_Express",
    "product_line": "RMS",
    "opsgenie_tag": "apple-express",
    "salesforce_account_id": "001OX00000qZU2lYAG",
    "position": 26
  },
  {
    "name": "Cardinal Health Ontario",
    "product_line": "RIL",
    "opsgenie_tag": "cardinal-health-ontario",
    "salesforce_account_id": "001OX00000qZU2sYAG",
    "position": 27
  },
  {
    "name": "Coupang INC",
    "product_line": "RMS",
    "opsgenie_tag": "coupang-inc",
    "salesforce_account_id": "001OX00000qZLajYAG",
    "position": 28
  },
  {
    "name": "Coupang INC14",
    "product_line": "RMS",
    "opsgenie_tag": "coupang-inc14",
    "salesforce_account_id": "001OX00000qZLaiYAG",
    "position": 29
  },
  {
    "name": "DB Schenker",
    "product_line": "RMS",
    "opsgenie_tag": "db-schenker",
    "salesforce_account_id": "001OX00000qZU33YAG",
    "position": 30
  },
  {
    "name": "DHL-NL",
    "product_line": "RMS",
    "opsgenie_tag": "dhl-nl",
    "salesforce_account_id": "001OX00000qZLakYAG",
    "position": 31
  },
  {
    "name": "Dillards",
    "product_line": "RMS",
    "opsgenie_tag": "dillards",
    "salesforce_account_id": "001OX00000qZLamYAG",
    "position": 32
  },
  {
    "name": "Dish-USA (El Paso)",
    "product_line": "RMS",
    "opsgenie_tag": "dish-usa-el-paso",
    "salesforce_account_id": "001OX00000qZU3FYAW",
    "position": 33
  },
  {
    "name": "Dorman",
    "product_line": "RMS",
    "opsgenie_tag": "dorman",
    "salesforce_account_id": "001OX00000qZU3GYAW",
    "position": 34
  },
  {
    "name": "Dorman Warsaw",
    "product_line": "RMS",
    "opsgenie_tag": "dorman-warsaw",
    "salesforce_account_id": "001OX00000qZU3HYAW",
    "position": 35
  },
  {
    "name": "Evergreen P&H",
    "product_line": "RA",
    "opsgenie_tag": "evergreen-ph",
    "salesforce_account_id": "001OX00000qZLapYAG",
    "position": 36
  },
  {
    "name": "EXOL",
    "product_line": "RIL",
    "opsgenie_tag": "exol",
    "salesforce_account_id": "001OX00000sr35nYAA",
    "position": 37
  },
  {
    "name": "Farmacia Tai",
    "product_line": "RMS",
    "opsgenie_tag": "farmacia-tai",
    "salesforce_account_id": "001OX00000qZLaqYAG",
    "position": 38
  },
  {
    "name": "Flaconi",
    "product_line": "RMS",
    "opsgenie_tag": "flaconi",
    "salesforce_account_id": "001OX00000qZU3RYAW",
    "position": 39
  },
  {
    "name": "Fujirebio-Ambient",
    "product_line": "RMS",
    "opsgenie_tag": "fujirebio-ambient",
    "salesforce_account_id": "001OX00000qZU3XYAW",
    "position": 40
  },
  {
    "name": "Fujirebio-Chill",
    "product_line": "RMS",
    "opsgenie_tag": "fujirebio-chill",
    "salesforce_account_id": "001OX00000qZU3YYAW",
    "position": 41
  },
  {
    "name": "GXO-Apple",
    "product_line": "RIL",
    "opsgenie_tag": "gxo-apple",
    "salesforce_account_id": "001OX00000qZLauYAG",
    "position": 42
  },
  {
    "name": "GXO-Lacoste",
    "product_line": "RIL",
    "opsgenie_tag": "gxo-lacoste",
    "salesforce_account_id": "001OX00000qZcajYAC",
    "position": 43
  },
  {
    "name": "GXO-Nike",
    "product_line": "RIL",
    "opsgenie_tag": "gxo-nike",
    "salesforce_account_id": "001OX00000qZLawYAG",
    "position": 44
  },
  {
    "name": "GXO-Verizon",
    "product_line": "RIL",
    "opsgenie_tag": "gxo-verizon",
    "salesforce_account_id": "001OX00000qZLaxYAG",
    "position": 45
  },
  {
    "name": "H&M P1",
    "product_line": "RA",
    "opsgenie_tag": "hm-p1",
    "salesforce_account_id": "001OX00000qZLayYAG",
    "position": 46
  },
  {
    "name": "H&M P1-RMS",
    "product_line": "RMS",
    "opsgenie_tag": "hm-p1-rms",
    "salesforce_account_id": "001OX00000qZcamYAC",
    "position": 47
  },
  {
    "name": "Ikea",
    "product_line": "RMS",
    "opsgenie_tag": "ikea",
    "salesforce_account_id": "001OX00000qZLb0YAG",
    "position": 48
  },
  {
    "name": "Jysk",
    "product_line": "RMS",
    "opsgenie_tag": "jysk",
    "salesforce_account_id": "001OX00000qZLb1YAG",
    "position": 49
  },
  {
    "name": "Kellanova-Rialto(California)",
    "product_line": "Case Pick",
    "opsgenie_tag": "kellanova-rialto-california",
    "salesforce_account_id": "001OX00000qZcavYAC",
    "position": 50
  },
  {
    "name": "Kenco Fairlife(Phoenix, USA)",
    "product_line": "Case Pick",
    "opsgenie_tag": "kenco-fairlife-phoenix-usa",
    "salesforce_account_id": "001OX00000wBZAzYAO",
    "position": 51
  },
  {
    "name": "Kenco Goodyear",
    "product_line": "Case Pick",
    "opsgenie_tag": "kenco-goodyear",
    "salesforce_account_id": "001OX00000qZcaxYAC",
    "position": 52
  },
  {
    "name": "Kenco Kansas",
    "product_line": "Case Pick",
    "opsgenie_tag": "kenco-kansas",
    "salesforce_account_id": "001OX00000qZcawYAC",
    "position": 53
  },
  {
    "name": "Lixil",
    "product_line": "RMS",
    "opsgenie_tag": "lixil",
    "salesforce_account_id": "001OX00000qZcayYAC",
    "position": 54
  },
  {
    "name": "Luxottica_Sedico",
    "product_line": "RIL",
    "opsgenie_tag": "luxottica-sedico",
    "salesforce_account_id": "001OX00000qZLb3YAG",
    "position": 55
  },
  {
    "name": "Mercado Libre",
    "product_line": "RIL",
    "opsgenie_tag": "mercado-libre",
    "salesforce_account_id": "001OX00000qZLb4YAG",
    "position": 56
  },
  {
    "name": "Mercado Libre(SP04)",
    "product_line": "RIL",
    "opsgenie_tag": "mercado-libre-sp04",
    "salesforce_account_id": "001OX00000qZLb5YAG",
    "position": 57
  },
  {
    "name": "Mitsubishi-Nippon",
    "product_line": "Case Pick",
    "opsgenie_tag": "mitsubishi-nippon",
    "salesforce_account_id": "001OX00000qZLb7YAG",
    "position": 58
  },
  {
    "name": "Nishiskawa",
    "product_line": "RMS",
    "opsgenie_tag": "nishiskawa",
    "salesforce_account_id": "001OX00000qZcb7YAC",
    "position": 59
  },
  {
    "name": "Ricoh-Nike",
    "product_line": "RMS",
    "opsgenie_tag": "ricoh-nike",
    "salesforce_account_id": "001OX00000qZcbDYAS",
    "position": 60
  },
  {
    "name": "Robinson USA (Dayton)",
    "product_line": "RA",
    "opsgenie_tag": "robinson-usa-dayton",
    "salesforce_account_id": "001OX00000qZLb8YAG",
    "position": 61
  },
  {
    "name": "Sodimac SBS",
    "product_line": "RIL",
    "opsgenie_tag": "sodimac-sbs",
    "salesforce_account_id": "001OX00000qZLbNYAW",
    "position": 62
  },
  {
    "name": "Sodimac-CC1",
    "product_line": "Case Pick",
    "opsgenie_tag": "sodimac-cc1",
    "salesforce_account_id": "001OX00000qZLbDYAW",
    "position": 63
  },
  {
    "name": "Sodimac-CC2",
    "product_line": "Case Pick",
    "opsgenie_tag": "sodimac-cc2",
    "salesforce_account_id": "001OX00000qZLbEYAW",
    "position": 64
  },
  {
    "name": "Sodimac-CC3",
    "product_line": "Case Pick",
    "opsgenie_tag": "sodimac-cc3",
    "salesforce_account_id": "001OX00000qZLbFYAW",
    "position": 65
  },
  {
    "name": "Sodimac-CC4",
    "product_line": "Case Pick",
    "opsgenie_tag": "sodimac-cc4",
    "salesforce_account_id": "001OX00000qZLbGYAW",
    "position": 66
  },
  {
    "name": "Sodimac-CC5",
    "product_line": "Case Pick",
    "opsgenie_tag": "sodimac-cc5",
    "salesforce_account_id": "001OX00000qZLbHYAW",
    "position": 67
  },
  {
    "name": "Sodimac-CC7",
    "product_line": "Case Pick",
    "opsgenie_tag": "sodimac-cc7",
    "salesforce_account_id": "001OX00000qZLbIYAW",
    "position": 68
  },
  {
    "name": "Sodimac-CC8",
    "product_line": "Case Pick",
    "opsgenie_tag": "sodimac-cc8",
    "salesforce_account_id": "001OX00000qZLbJYAW",
    "position": 69
  },
  {
    "name": "Sodimac-CC9",
    "product_line": "Case Pick",
    "opsgenie_tag": "sodimac-cc9",
    "salesforce_account_id": "001OX00000qZLbKYAW",
    "position": 70
  },
  {
    "name": "Sodimac-Colombia",
    "product_line": "Case Pick",
    "opsgenie_tag": "sodimac-colombia",
    "salesforce_account_id": "001OX00000qZLbLYAW",
    "position": 71
  },
  {
    "name": "Sodimac-FLR",
    "product_line": "Case Pick",
    "opsgenie_tag": "sodimac-flr",
    "salesforce_account_id": "001OX00000qZcbIYAS",
    "position": 72
  },
  {
    "name": "Stryker",
    "product_line": "RMS",
    "opsgenie_tag": "stryker",
    "salesforce_account_id": "001OX00000qZcbJYAS",
    "position": 73
  },
  {
    "name": "Trusco Saitama",
    "product_line": "Case Pick",
    "opsgenie_tag": "trusco-saitama",
    "salesforce_account_id": "001OX00000qZLbOYAW",
    "position": 74
  },
  {
    "name": "Trusco Tohoku",
    "product_line": "Case Pick",
    "opsgenie_tag": "trusco-tohoku",
    "salesforce_account_id": "001OX00000qZLbPYAW",
    "position": 75
  },
  {
    "name": "Walmart-Canada",
    "product_line": "RMS",
    "opsgenie_tag": "walmart-canada",
    "salesforce_account_id": "001OX00000qZLbQYAW",
    "position": 76
  },
  {
    "name": "Way Fair",
    "product_line": "RIL",
    "opsgenie_tag": "way-fair",
    "salesforce_account_id": "001OX00000qZLbTYAW",
    "position": 77
  },
  {
    "name": "Owens & Minor",
    "product_line": "RMS",
    "opsgenie_tag": "owens-minor",
    "salesforce_account_id": "001OX00000qZcb9YAC",
    "position": 78
  },
  {
    "name": "Casey's Joplin",
    "product_line": "Case Pick",
    "opsgenie_tag": "caseys-joplin",
    "salesforce_account_id": "001OX00000uwSzyYAE",
    "position": 79
  }
];

