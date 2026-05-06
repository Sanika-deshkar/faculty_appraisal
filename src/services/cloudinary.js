const CLOUDINARY_CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

export const isCloudinaryConfigured = () =>
  Boolean(CLOUDINARY_CLOUD_NAME && CLOUDINARY_UPLOAD_PRESET);

export const uploadToCloudinary = async (file, options = {}) => {
  if (!isCloudinaryConfigured()) {
    throw new Error(
      "Cloudinary is not configured. Add VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET to .env."
    );
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

  if (options.folder) {
    formData.append("folder", options.folder);
  }

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`,
    {
      method: "POST",
      body: formData,
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message || "Cloudinary upload failed.");
  }

  return {
    name: file.name,
    url: data.secure_url,
    type: file.type || data.resource_type,
    publicId: data.public_id,
    resourceType: data.resource_type,
    bytes: data.bytes,
  };
};


