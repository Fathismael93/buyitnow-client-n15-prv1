import * as yup from 'yup';

export const loginSchema = yup.object().shape({
  email: yup.string().email().required(),
  password: yup.string().required().min(6),
});

export const registerSchema = yup.object().shape({
  name: yup.string().required().min(3),
  phone: yup.number().positive().integer().required().min(6),
  email: yup.string().email().required(),
  password: yup.string().required().min(6),
});

export const searchSchema = yup.object().shape({
  keyword: yup.string().required().min(1),
});

export const profileSchema = yup.object().shape({
  name: yup.string().required().min(3),
  phone: yup.number().positive().integer().required().min(6),
});

export const addressSchema = yup.object().shape({
  street: yup.string().required().min(3),
  city: yup.string().required().min(3),
  state: yup.string().required().min(2),
  zipCode: yup.number().positive().required().min(3),
  phoneNo: yup.number().positive().integer().required().min(6),
  country: yup.string().required().min(3),
});

export const paymentSchema = yup.object().shape({
  paymentType: yup.string().required(),
  accountName: yup.string().required().min(3),
  accountNumber: yup.number().positive().integer().required().min(4),
});

export const emailSchema = yup.object().shape({
  subject: yup.string().required().min(5),
  message: yup.string().required().min(3),
});
