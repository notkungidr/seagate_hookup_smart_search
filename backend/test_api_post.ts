async function test() {
  const ptNos = [
    "PT260525472_N",
    "PT260525471_N",
    "PT260522419_H",
    "PT260524002_N",
    "PT260524001_N",
    "PT260522490_N",
    "PT260522489_N",
    "PT260525449_N",
    "PT260525448_N",
    "PT260526192_H",
    "PT260526191_H",
    "PT260526295_H",
    "PT260525293_N",
    "PT260522470_H",
    "PT260526187_H",
    "PT260525470_N"
  ];

  console.log("Sending POST request to endpoint...");
  const res = await fetch("http://localhost:9090/api/v1/trace/apiPtAcaToCoilMagnetWireNo", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      pt_no: ptNos,
      lot_coil: "",
      S2_pt_no: "",
      magnet_wire_no: "",
      S3_mc_no: "",
      spool1_no: "",
      spool2_no: ""
    })
  });

  const json = await res.json();
  console.log("API Response:", JSON.stringify(json, null, 2));
}

test().catch(console.error);
