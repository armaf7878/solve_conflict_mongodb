const Ticket = require("../models/Ticket");
const User = require("../models/User");
const Showtime = require("../models/Showtime");
const ticketService = require("../services/ticketService");
const mongoose = require("mongoose");
const { ObjectId } = mongoose.Types;
class TicketController {
  //[POST] - ticket/create
  async create(req, res) {
    try {
      const { user_id, showtime_id, seat_id, price } = req.body;
      const userExists = await User.findById(user_id);
      if (!userExists) {
        return res.status(404).json({ message: "Người dùng không tồn tại" });
      }
      const showtimeExists = await Showtime.findOne(
        { _id: showtime_id, status: "Active" },
        {}
      );
      if (!showtimeExists) {
        return res
          .status(404)
          .json({ message: "Showtime đã bị khóa hoặc không tồn tại" });
      }

      const seatValid = showtimeExists.seats.some(
        (seat) => seat.seat_id === seat_id && seat.status === "available"
      );
      if (!seatValid) {
        return res
          .status(404)
          .json({ message: "Ghế không tồn tại hoặc đã bị đặt bởi người khác" });
      }

      const existsTicket = await Ticket.findOne({
        showtime_id: new ObjectId(showtime_id),
        seat_id: seat_id,
        status: { $in: ["pending_payment", "paid"] },
      });

      if (existsTicket) {
        return res.status(409).json({
          message: "Ghế này đã được đặt bởi người khác",
        });
      }

      const newTicket = new Ticket({
        user_id,
        showtime_id,
        seat_id,
        price,
        status: "pending_payment",
      });

      const savedTicket = await newTicket.save();
      await Showtime.updateOne(
        { _id: showtime_id, "seats.seat_id": seat_id },
        { $set: { "seats.$.status": "locked" } }
      );
      return res.status(200).json({
        message: "Đặt vé thành công",
        ticket: savedTicket,
      });
    } catch (err) {
      console.error("Lỗi đặt vé", err.code);
      if (err.code === 11000) {
        return res.status(409).json({
          message: "Xung đột vé đã tồn tại",
          error: err.message,
        });
      }

      return res.status(500).json({
        message: "Lỗi máy chủ",
        error: err.message,
      });
    }
  }

  //[GET] - ticket/payment/:ticketID
  async payment(req, res) {
    const session = await mongoose.startSession();
    const ticketId = req.params.id;
    try {
      session.startTransaction();
      const ticket = await Ticket.findById(ticketId).session(session);
      if (!ticket) {
        throw new Error("Vé không tồn tại");
      }
      if (ticket.status !== "pending_payment") {
        throw new Error("Vé không còn trong trạng thái chờ thanh toán");
      }

      const currentVersion = ticket.version;

      const ticketUpdate = await Ticket.updateOne(
        { _id: ticketId, status: "pending_payment", version: currentVersion },
        { $set: { status: "paid" }, $inc: { version: 1 } },
        { session }
      );

      if (ticketUpdate.modifiedCount === 0) {
        throw new Error("Vé đã bị xử lý bởi tiến trình khác");
      }

      await User.updateOne(
        { _id: ticket.user_id },
        { $inc: { wallet: -ticket.price } },
        { session }
      );

      await Showtime.updateOne(
        {
          _id: ticket.showtime_id,
          "seats.seat_id": ticket.seat_id,
        },

        {
          $set: {
            "seats.$.status": "booked",
          },
        },
        { session }
      );

      await session.commitTransaction();
      session.endSession();
      return res.status(200).json({
        message: "Đã lấy được ticket",
        data: ticket,
      });
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message: "Lỗi trong thanh toán vé",
        error: err.message,
      });
    }
  }

  //[Cron Job]
  async expireTicket() {
    console.log("Kiểm tra cron job có hoạt động");
    const ticketsExpire = await Ticket.find({
      status: "pending_payment",
      createdAt: { $lt: new Date(Date.now() - 3 * 60 * 1000) },
    });
    for (const t of ticketsExpire) {
      const session = await mongoose.startSession();
      session.startTransaction();
      try {
        const currentVersion = t.version;
        const ticketUpdate = await Ticket.updateOne(
          {
            _id: t._id,
            status: "pending_payment",
            version: currentVersion,
          },

          {
            $set: { status: "canceled" },
            $inc: { version: 1 },
          },
          { session }
        );

        if (ticketUpdate.modifiedCount === 0) {
          await session.abortTransaction();
          session.endSession();
          continue;
        }

        await Showtime.updateOne(
          { _id: t.showtime_id, "seats.seat_id": t.seat_id },
          { $set: { "seats.$.status": "available" } },
          { session }
        );

        await session.commitTransaction();
        session.endSession();
      } catch (err) {
        await session.abortTransaction();
        session.endSession();
      }
    }
  }

  async bookSeatsController(req, res) {
    // Các tham số cần thiết từ body: userId, showtimeId, seat1Id, seat2Id, price
    const { userId, showtimeId, seat1Id, seat2Id, price } = req.body;

    if (!userId || !showtimeId || !seat1Id || !seat2Id || !price) {
      return res
        .status(400)
        .json({ message: "Thiếu thông tin đặt vé cần thiết." });
    }

    try {
      // Mỗi request HTTP sẽ tạo ra một GIAO TÁC T (T1 hoặc T2)
      const bookedTickets = await ticketService.bookSeatsTransaction(
        userId,
        showtimeId,
        seat1Id, // Thứ tự khóa sẽ là seat1Id -> seat2Id
        seat2Id,
        price
      );

      return res.status(200).json({
        message: "Đặt vé thành công!",
        tickets: bookedTickets,
      });
    } catch (error) {
      // --- Xử lý lỗi trả về từ Service ---
      let statusCode = 500;
      let errorMessage = "Lỗi hệ thống không xác định.";

      if (error.message.includes("đã có người đặt")) {
        statusCode = 409; // Conflict
        errorMessage = "Đặt vé thất bại: " + error.message;
      } else if (error.message.includes("Deadlock/Xung đột")) {
        statusCode = 503; // Service Unavailable
        errorMessage =
          "Đặt vé thất bại sau nhiều lần thử lại do xung đột đồng thời.";
      } else if (error.code === 11000) {
        // Duplicate Key Error
        statusCode = 409;
        errorMessage = "Lỗi trùng lặp dữ liệu (Ghế đã bị đặt).";
      }

      console.error(
        `[CONTROLLER] Lỗi xử lý đặt vé cho User ${userId}:`,
        error.message
      );

      return res.status(statusCode).json({
        message: errorMessage,
        details: error.message,
      });
    }
  }
  async holdLockController(req, res) {
    // Lấy tham số cần thiết: userId, showtimeId, seatId, price
    const { userId, showtimeId, seatId, price } = req.body;

    if (!userId || !showtimeId || !seatId || !price) {
      return res
        .status(400)
        .json({ message: "Thiếu thông tin giữ khóa cần thiết." });
    }

    // Chúng ta không chờ hàm này hoàn thành (await)
    // vì nó được thiết kế để chạy nền và giữ khóa trong 30s.
    ticketService.holdLockAndBlock(userId, showtimeId, seatId, price);

    return res.status(202).json({
      message: `Đã kích hoạt chế độ GIỮ KHÓA trên Ghế ${seatId} trong 30 giây. Các yêu cầu khác sẽ bị chặn.`,
    });
  }
}

module.exports = new TicketController();
