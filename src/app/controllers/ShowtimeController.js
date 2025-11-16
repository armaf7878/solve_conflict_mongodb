const mongoose = require('mongoose');
const Showtime = require('../models/Showtime');
const Ticket = require('../models/Ticket');
const User  = require('../models/User');
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
    const{id} = req.params;
    let earlyStop = false;
    let session;

    mongoose.startSession()
    .then((_session) => {
      session = _session;
      return Showtime.updateOne(
        {_id: new ObjectId(id), status:{$ne: 'Locked'}},
        {$set:{status: 'Locked'}}
      )
    })
    .then((locked) => {
      if(locked.modifiedCount == 0){    
        earlyStop = true;
        session.endSession();
        return res.status(401).json({err: 'Đã khóa suất chiếu này từ trước'});
      }
      return Ticket.find({ showtime_id: new ObjectId(id) }).session(session);
    })
    .then(async (tickets) => {
      if (earlyStop) return;
      if (!tickets || tickets.length === 0) {    
        console.log('Không có vé nào liên quan để xử lý.');
        session.endSession();
        return res.status(200).json("Không có vé liên quan để xử lý");
      }
      session.startTransaction();
      const pendingTickets = tickets.filter(t => t.status === 'pending_payment');
      const paidTickets = tickets.filter(t => t.status === 'paid');
      console.log(`Có ${pendingTickets.length} vé Pending và ${paidTickets.length} vé Paid`);
      if(pendingTickets.length > 0){
        const pending_tickets_id = pendingTickets.map(t => t._id);
        await Ticket.updateMany(
          {_id: {$in: pending_tickets_id}},
          {$set: {status: 'canceled'}},
          {session}
        );
      }
      // throw new Error("Mô phỏng lỗi hệ thống: mất kết nối hoặc crash giữa transaction!");
      if(paidTickets.length > 0){
          const paid_tickets_id = paidTickets.map(t => t._id);
          const refund_map = {};

          paidTickets.forEach(t => {
            const uid = t.user_id.toString();
            refund_map[uid] = t.price
            console.log(typeof(t.price))
          });
          
          await Ticket.updateMany(
            {_id: {$in: paid_tickets_id}},
            {$set: {status: 'refund'}},
            {session}
          );
          console.log(refund_map)
          const refundPromises = Object.entries(refund_map).map(([userId, totalRefund]) => {
            console.log(userId)
            return  User.updateOne(
              {_id: new ObjectId(userId)},
              {$inc:{wallet: +totalRefund}},
              {session}
            )
          })
          
          await Promise.all(refundPromises);
      }


      await session.commitTransaction();
      session.endSession();
      return res.status(200).json({
        message: 'Đã xóa xuất chiểu và chuyển trạng thái với các vé liên quan(Transaction Commit) - Hoàn tiền thành công đới với những khách đã trả tiền'
      });
    })
    .catch(async(err) => {
      if(session){
        await session.abortTransaction();
        session.endSession();
      }
      await Showtime.updateOne({_id: new ObjectId(id)}, {$set: {status: 'Active'}});
      res.status(500).json({message: 'Lỗi khi xóa xuất chiếu (Rollback Transaction', error: err.message});
    })
  }
}
module.exports = new ShowtimeController();

