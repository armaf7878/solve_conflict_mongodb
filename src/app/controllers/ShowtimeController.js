const mongoose = require('mongoose');
const Showtime = require('../models/Showtime');
const Ticket = require('../models/Ticket');
const { ObjectId } = mongoose.Types;

class ShowtimeController {
  // [GET] /showtime/showall
  showall(req, res) {
    Showtime.find({})
      .then((showtimes) => res.json(showtimes))
      .catch((err) => res.json(err));
  }

  // [DELETE] /showtime/:id
  async delete(req, res) {
    const { id } = req.params;
    const session = await mongoose.startSession();

    try {
      // ✅ Bước 1: Lock suất chiếu ngay lập tức (ngoài transaction)
      const locked = await Showtime.updateOne(
        { _id: new ObjectId(id), status: { $ne: 'Locked' } },
        { $set: { status: 'Locked' } }
      );

      if (locked.modifiedCount === 0) {
        return res
          .status(400)
          .json({ message: 'Suất chiếu đã bị khóa hoặc không tồn tại.' });
      }

      console.log("Bước 1: Showtime locked");

      // ✅ Bước 2: Bắt đầu transaction
      session.startTransaction();
      console.log("Bước 2: Transaction started");

      // ✅ Bước 3: Xóa tất cả vé liên quan đến suất chiếu này
      const ticketDelete = await Ticket.deleteMany({
        showtime_id: new ObjectId(id),
      }).session(session);

      console.log("Bước 3: Đã xóa vé:", ticketDelete.deletedCount);

      // ✅ Bước 4: Xóa suất chiếu
      const showtimeDelete = await Showtime.deleteOne({
        _id: new ObjectId(id),
      }).session(session);

      console.log("Bước 4: Đã xóa suất chiếu:", showtimeDelete.deletedCount);

      // ✅ Bước 5: Commit transaction
      await session.commitTransaction();
      console.log("Bước 5: Transaction commit thành công");
      session.endSession();

      res.status(200).json({
        message:
          '✅ Xóa suất chiếu và vé liên quan thành công (transaction commit).',
      });
    } catch (err) {
      console.error("❌ Lỗi transaction:", err);
      await session.abortTransaction();
      session.endSession();

      // ❗ Mở khóa lại nếu transaction fail
      await Showtime.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: 'Active' } }
      );

      res.status(500).json({
        message: '❌ Lỗi khi xóa suất chiếu (transaction rollback).',
        error: err.message,
      });
    }
  }
}

module.exports = new ShowtimeController();
