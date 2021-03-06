/***************************************
 * Copyright 2011, 2012 GlobWeb contributors.
 *
 * This file is part of GlobWeb.
 *
 * GlobWeb is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, version 3 of the License, or
 * (at your option) any later version.
 *
 * GlobWeb is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with GlobWeb. If not, see <http://www.gnu.org/licenses/>.
 ***************************************/

/** @constructor
	GlobWeb.HEALPixBase module
	Module which contains all the maths stuff
*/
GlobWeb.HEALPixBase = (function(){
	
	var HALF_PI = 3.14159265/2;
	
	var compress_bits = function(v){

		//  raw  = v & 0x5555555555555 in place of raw = v & 0x5555555555555555
		//		--> still not resolved, dunno why
		//
		
		// in Java implementation mask == 0x5555555555555555
		// var raw = v & 0x5555555555555; // v & 101010101010101010101010101010101010101010101010101010101010101
										  // // raw>>>15 = 0101010101010101010101010101010101010101010101010
		// var dec = raw>>>15;
		// raw |= dec;				  // 101010101010101111111111111111111111111111111111111111111111111
		// var raw1 = (raw&0xffff);
		// var dec2 = raw>>>31;
		// var raw2 = (dec2&0xffff);
		
		var longV = GlobWeb.Long.fromNumber(v);
		var longMask = GlobWeb.Long.fromNumber(0x5555555555555);
		var raw = longV.and(longMask);
		var dec = raw.shiftRightUnsigned(15);
		raw = raw.or(dec);
		var raw1 = (raw.and(GlobWeb.Long.fromNumber(0xffff))).toInt();
		var dec2 = raw.shiftRightUnsigned(32);
		var raw2 = (dec2.and(GlobWeb.Long.fromNumber(0xffff))).toInt();
		
		return GlobWeb.HealPixTables.ctab[raw1&0xff] | (GlobWeb.HealPixTables.ctab[raw1>>>8]<< 4) | (GlobWeb.HealPixTables.ctab[raw2&0xff]<<16) | (GlobWeb.HealPixTables.ctab[raw2>>>8]<<20);
	}

	var spread_bits = function(v)
	{
		return (GlobWeb.HealPixTables.utab[ v      &0xff])      | ((GlobWeb.HealPixTables.utab[(v>>> 8)&0xff])<<16)
			| ((GlobWeb.HealPixTables.utab[(v>>>16)&0xff])<<32) | ((GlobWeb.HealPixTables.utab[(v>>>24)&0xff])<<48);
	}

	/**
	 *	Function describing a location on the sphere
	*/
	var fxyf = function(_fx,_fy,_face){
		
		var jr = GlobWeb.HealPixTables.jrll[_face] - _fx - _fy;
		var z = 0;
		var phi = 0;
		var sth = 0;
		var have_sth = false;

		var nr;
		if (jr<1){
			nr = jr;
			var tmp = nr*nr/3.;
			z = 1 - tmp;
			if (z>0.99) { sth=Math.sqrt(tmp*(2.-tmp)); have_sth=true; }
		} else if (jr>3){
			nr = 4-jr;
			var tmp = nr*nr/3.;
			z = tmp - 1;
			if (z<-0.99) {
				sth=Math.sqrt(tmp*(2.-tmp)); 
				have_sth=true;
			}
		} else {
			nr = 1;
			z = (2-jr)*2./3.;
		}

		var tmp=GlobWeb.HealPixTables.jpll[_face]*nr+_fx-_fy;
		if (tmp<0) tmp+=8;
		if (tmp>=8) tmp-=8;
		
		phi = (nr<1e-15) ? 0 : (0.5*HALF_PI*tmp)/nr;
		
		var st = (have_sth) ? sth : Math.sqrt((1.0-z)*(1.0+z));
		return [st*Math.cos(phi), st*Math.sin(phi), z]
	}
	
	/**
	*	Static function
	*	Convert nside to order
	*	(ilog2(nside))
	*/
	var nside2order = function(arg){
		
		var res=0;
		while (arg > 0x0000FFFF) { res+=16; arg>>>=16; }
		if (arg > 0x000000FF) { res|=8; arg>>>=8; }
		if (arg > 0x0000000F) { res|=4; arg>>>=4; }
		if (arg > 0x00000003) { res|=2; arg>>>=2; }
		if (arg > 0x00000001) { res|=1; }
		return res;
	
	}

	/**
	 *	Returns pixel index of point on sphere
	 *
	 *	@param order Tile order
	 *	@param lon Longitude
	 *	@param lat Latitude
	 */
	var lonLat2pix = function(order, lon, lat)
	{
		var loc = lonLat2ang( lon, lat );
		return loc2pix( order, loc[0], loc[1] );
	}

	/**
	 *	Longitude/latitude to HEALPix coordinate system angle conversion
	 *
	 *	@param	lon Longitude
	 *	@param 	lat Latitude
	 *	@return	{Float[]} Returns[ phi, theta ], where:
     *				Phi is the azimuth(or azimuthal angle) which belongs to interval [0;2*pi] (counterclockwise).
	 *				Theta is the inclination(or polar angle) which belongs to interval [0;pi] (0 rad = north pole). 
	 */
	var lonLat2ang = function(lon, lat)
    {
    	if ( lon < 0 )
    		lon += 360;

    	var phi = lon * Math.PI / 180.;
    	
    	var theta = ( -lat + 90 ) * Math.PI / 180;
    	return [phi, theta];
    }

	/**
	 *	Returns the remainder of the division {@code v1/v2}.
	 *  The result is non-negative.
	 *
	 *	@param 	v1 dividend; can be positive or negative
	 *	@param 	v2 divisor; must be positive
	 *	@return Remainder of the division; positive and smaller than {@code v2}
	 */
	var fmodulo = function(v1, v2)
	{
		if (v1>=0)
			return (v1<v2) ? v1 : v1%v2;
		var tmp=v1%v2+v2;
		return (tmp==v2) ? 0. : tmp;
	}

	var xyf2nest = function(ix, iy, face_num, order)
    {
	    return ((face_num)<<(2*order)) +
	     		 spread_bits(ix) + (spread_bits(iy)<<1);
    }

  	/**
  	 *	Returns the pixel index of point on sphere
  	 *	(TODO Maybe make conversation to Long for high orders(really high orders > 28))
  	 *
  	 *	@param 	order Tile order
  	 *	@param	phi Azimuth(or azimuthal angle) in radians
  	 *	@param  theta Inclination(or polar angle) in radians
  	 *	@return The pixel index of pointing.
	 */
	var loc2pix = function(order, phi, theta)
	{
		var nside = Math.pow(2, order);
		var z = Math.cos(theta);
		var phi = phi;

		var loc = {
			phi: phi,
			theta: theta,
			z: z
		}

		if (Math.abs(z)>0.99)
		{
		  loc.sth = Math.sin(theta);
		  loc.have_sth=true;
		}

		var inv_halfpi = 2/Math.PI;
		var tt = fmodulo((phi*inv_halfpi),4.0);// in [0,4)

		var za = Math.abs(z);
		if (za<=2./3.) // Equatorial region
		{
			// Double
			var temp1 = nside*(0.5+tt);
			var temp2 = nside*(z*0.75);
			// Long
			var jp = (temp1-temp2); // index of  ascending edge line
			var jm = (temp1+temp2); // index of descending edge line
			var ifp = jp >>> order;  // in {0,4}
			var ifm = jm >>> order;
			var face_num = (ifp==ifm) ? (ifp|4) : ((ifp<ifm) ? ifp : (ifm+8));

			var ix = jm & (nside-1),
				iy = nside - (jp & (nside-1)) - 1;
			return xyf2nest(Math.floor(ix),Math.floor(iy), Math.floor(face_num), order);
		}
			else // polar region, za > 2/3
		{
		var ntt = Math.min(3,Math.floor(tt)); // int
		var tp = tt-ntt; // double
		var tmp = ((za<0.99)||(!loc.have_sth)) ? // double
					nside*Math.sqrt(3*(1-za)) :
					nside*loc.sth/Math.sqrt((1.+za)/3.);

		var jp = (tp*tmp); // increasing edge line index (long)
		var jm = ((1.0-tp)*tmp); // decreasing edge line index (long)
		if (jp>=nside) jp = nside-1; // for points too close to the boundary
		if (jm>=nside) jm = nside-1;
		return (z>=0) ?
		  xyf2nest(Math.floor(nside-jm -1),Math.floor(nside-jp-1),ntt,order) :
		  xyf2nest(Math.floor(jp),Math.floor(jm),ntt+8,order);
		}
	}
	
	return {
			compress_bits: compress_bits,
			fxyf: fxyf,
			nside2order: nside2order,
			lonLat2pix: lonLat2pix
		};
}());