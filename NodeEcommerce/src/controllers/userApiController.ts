import config from "config";
import User, { IUser } from "../models/User";
import { Response } from "express";
import Request from "../types/Request";
import { dataArray, responseFunction } from "../response_builder/responsefunction";
import responsecode from "../response_builder/responsecode";
import { mailService } from "../services/mail";
const CryptoJs = require('crypto-js');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const userController = {
    register: async function register(req: Request, res: Response) {
        try {
            let user: any = await User.findOne({ userName: req.body.userName });
            if (!user) {
                let newUser: IUser = new User({
                    userName: req.body.userName,
                    email: req.body.email,
                    password: CryptoJs.AES.encrypt(req.body.password, process.env.PASS_SECRET)
                });
                const savedUser: any = await newUser.save();
                await mailService(req.body.email, req.body.userName, req.body.password);
                let meta: object = { message: "Registered Successfully", status: "Success" };
                responseFunction(meta, savedUser, responsecode.Created, res);
            } else {
                let meta: object = { message: "User Already Register", status: "Failed" };
                responseFunction(meta, dataArray, responsecode.Forbidden, res);
            }
        } catch (error) {
            let meta: object = { message: "Server error", status: "Failed" };
            responseFunction(meta, dataArray, responsecode.Internal_Server_Error, res);
        }
    },

    login: async function login(req: Request, res: Response) {
        try {
            const user: any = await User.findOne({ userName: req.body.userName });
            const hashPassword: any = CryptoJs.AES.decrypt(user.password, process.env.PASS_SECRET);
            const password: string = hashPassword.toString(CryptoJs.enc.Utf8);
            if (user && password === req.body.password) {
                const { password, ...others } = user._doc;
                const token: string = jwt.sign(
                    { user_id: user._id, user_isAdmin: user.isAdmin },
                    config.get("jwtSecret"),
                    { expiresIn: config.get("jwtExpiration") }
                );
                let data: object = {
                    "data": others,
                    "token": token
                };
                let meta: object = { message: "logged in successfully", status: "Success" };
                responseFunction(meta, data, responsecode.Success, res);
            } else {
                let meta: object = { message: "wrong credential", status: "Failed" };
                responseFunction(meta, dataArray, responsecode.Forbidden, res);
            }
        } catch (error) {
            let meta: object = { message: "Server error", status: "Failed" };
            responseFunction(meta, dataArray, responsecode.Internal_Server_Error, res);
        }
    },

    update: async function update(req: Request, res: Response) {
        if (req.body.password) {
            req.body.password = CryptoJs.AES.encrypt(req.body.password, process.env.PASS_SECRET).toString();
        }
        try {
            if (req.userId === req.params.id || req.isAdmin) {
                const updatedUser = await User.findByIdAndUpdate(req.params.id, {
                    $set: req.body
                }, { new: true });
                let meta: object = { message: "User updated successfully", status: "Success" };
                responseFunction(meta, updatedUser, responsecode.Success, res);
            } else {
                let meta: object = { message: "you are not allowed to do that", status: "Failed" };
                responseFunction(meta, dataArray, responsecode.Forbidden, res);
            }
        } catch (error) {
            return res.status(500).json(error);
        }
    },

    deleteUser: async function deleteUser(req: Request, res: Response) {
        try {
            if (req.isAdmin) {
                await User.findByIdAndDelete(req.params.id);
                let meta: object = { message: "User Deleted successfully", status: "Success" };
                responseFunction(meta, dataArray, responsecode.Success, res);
            } else {
                let meta: object = { message: "you are not allowed to do that", status: "Failed" };
                responseFunction(meta, dataArray, responsecode.Forbidden, res);
            }
        } catch (error) {
            return res.status(500).json(error);
        }
    },

    getUser: async function getUser(req: Request, res: Response) {
        try {
            const user: any = await User.findById(req.params.id);
            const { password, ...others } = user._doc;
            if (user) {
                let meta: object = { message: "User Fetched successfully", status: "Success" };
                responseFunction(meta, others, responsecode.Success, res);
            } else {
                let meta: object = { message: "user not found", status: "Failed" };
                responseFunction(meta, dataArray, responsecode.Not_Found, res);
            }
        } catch (error) {
            return res.status(500).json(error);
        }
    },
    getAllUser: async function getAllUser(req: Request, res: Response) {
        const query: any = req.query.new;
        try {
            const users: any = query ? await User.find().sort({ _id: -1 }).limit(1) : await User.find();
            if (users) {
                let meta: object = { message: "Users Fetched successfully", status: "Success" };
                responseFunction(meta, users, responsecode.Success, res);
            } else {
                let meta: object = { message: "user not found", status: "Failed" };
                responseFunction(meta, dataArray, responsecode.Not_Found, res);
            }
        } catch (error) {
            return res.status(500).json(error);
        }
    },

    getUserStats: async function getUserStats(req: Request, res: Response) {
        const date: Date = new Date();
        const lastYear: Date = new Date(date.setFullYear(date.getFullYear() - 1));
        try {
            const data: any = await User.aggregate([
                { $match: { createdAt: { $gt: lastYear } } },
                {
                    $project: {
                        month: { $month: "$createdAt" },
                    },
                },
                {
                    $group: {
                        _id: "$month",
                        total: { $sum: 1 },
                    },
                },
            ]);
            let meta: object = { message: "Users Fetched successfully", status: "Success" };
            responseFunction(meta, data, responsecode.Success, res);
        } catch (error) {
            return res.status(500).json(error);
        }
    },

    forgotPassword: async function forgotPassword(req: Request, res: Response) {
        let password: string;
        try {
            let user: any = await User.findById(req.userId);
            if (user) {
                const hashPassword: any = CryptoJs.AES.decrypt(user.password, process.env.PASS_SECRET);
                password = hashPassword.toString(CryptoJs.enc.Utf8);
                if (req.body.currentPassword === password) {
                    if (req.body.newPassword === req.body.confirmPassword) {
                        await User.updateOne({ "_id": req.userId }, { $set: { "password": CryptoJs.AES.encrypt(req.body.newPassword, process.env.PASS_SECRET).toString() } });
                        await mailService(user.email,user.userName,req.body.newPassword);
                        let meta: object = { message: "Password Updated Successfully", status: "Success" };
                        responseFunction(meta, dataArray, responsecode.Success, res);
                    } else {
                        let meta: object = { message: "your new password and confirm password not match", status: "Failed" };
                        responseFunction(meta, dataArray, responsecode.Bad_Request, res);
                    }
                } else {
                    let meta: object = { message: "your current password is wrong", status: "Failed" };
                    responseFunction(meta, dataArray, responsecode.Not_Found, res);
                }
            } else {
                res.json([]);
            }
        } catch (error) {
            return res.status(500).json(error);
        }
    }
}

export default userController;