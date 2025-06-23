import axios from 'axios';

const PINATA_API_KEY = "3bf4164172fae7b68de3";
const PINATA_API_SECRET = "32288745dd22dabdcc87653918e33841ccfcfbd45c43a89709f873aedcc7c9fe";

export async function uploadToPinata({ imageFile, description }) {
  // 1. Upload image to Pinata
  const formData = new FormData();
  formData.append('file', imageFile);

  const imageRes = await axios.post(
    'https://api.pinata.cloud/pinning/pinFileToIPFS',
    formData,
    {
      maxContentLength: 'Infinity',
      headers: {
        'Content-Type': 'multipart/form-data',
        pinata_api_key: PINATA_API_KEY,
        pinata_secret_api_key: PINATA_API_SECRET,
      },
    }
  );
  const imageHash = imageRes.data.IpfsHash;

  // 2. Upload metadata JSON to Pinata
  const metadata = {
    description,
    image: `ipfs://${imageHash}`,
  };

  const jsonRes = await axios.post(
    'https://api.pinata.cloud/pinning/pinJSONToIPFS',
    metadata,
    {
      headers: {
        pinata_api_key: PINATA_API_KEY,
        pinata_secret_api_key: PINATA_API_SECRET,
      },
    }
  );
  return jsonRes.data.IpfsHash; // This is the CID for your metadata
}
